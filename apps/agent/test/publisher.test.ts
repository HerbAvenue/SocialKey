import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  conversationWith,
  generateSecretKey,
  identityFromSecretKey,
  MAX_RECENT_POSTS,
  openMessage,
  readManifest,
  readMessage,
  readMessagePage,
  readPost,
  readPostPage,
} from '@socialkey/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { NotFoundError, Publisher } from '../src/publisher'
import { FakeKubo } from './fake-kubo'

const identity = identityFromSecretKey(generateSecretKey())

describe('Publisher', () => {
  let kubo: FakeKubo
  let stateFile: string
  const make = () => new Publisher({ kubo, identity, keyName: 'socialkey', stateFile })

  beforeEach(async () => {
    kubo = new FakeKubo()
    stateFile = join(await mkdtemp(join(tmpdir(), 'socialkey-')), 'manifest.dagjson')
  })

  it('publishes an empty manifest on first run', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const { manifest, cid } = publisher.current
    expect(manifest.profile.displayName).toBe('Alice')
    expect(kubo.published).toEqual([{ cid, keyName: 'socialkey' }])
    expect(readManifest(kubo.block(cid)).author).toBe(identity.did)
  })

  it('creates a signed post and links it from the published manifest', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const { post, manifest } = await publisher.createPost({ text: 'first!' })
    expect(readPost(kubo.block(post)).text).toBe('first!')
    expect(readManifest(kubo.block(manifest)).posts).toEqual([post])
    expect(kubo.published.at(-1)?.cid).toEqual(manifest)
  })

  it('restores state from disk on restart', async () => {
    const first = make()
    await first.init('Alice')
    await first.createPost({ text: 'persisted' })
    const second = make()
    await second.init('ignored')
    expect(second.current.cid).toEqual(first.current.cid)
    expect(second.current.manifest.profile.displayName).toBe('Alice')
  })

  it('rejects invalid posts without publishing', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const before = kubo.published.length
    await expect(publisher.createPost({ text: 'x'.repeat(5000) })).rejects.toThrow()
    expect(kubo.published.length).toBe(before)
  })

  it('keeps the previous manifest when publishing fails', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const { cid } = publisher.current
    kubo.failPublish = true
    await expect(publisher.createPost({ text: 'lost' })).rejects.toThrow()
    expect(publisher.current.cid).toEqual(cid)
    kubo.failPublish = false
    await publisher.createPost({ text: 'works again' })
    expect(publisher.current.manifest.posts).toHaveLength(1)
  })

  it('applies concurrent changes in order', async () => {
    const publisher = make()
    await publisher.init('Alice')
    await Promise.all(Array.from({ length: 5 }, (_, i) => publisher.createPost({ text: `post ${i}` })))
    expect(publisher.current.manifest.posts).toHaveLength(5)
  })

  it('rolls old posts into pages', async () => {
    const publisher = make()
    await publisher.init('Alice')
    for (let i = 0; i <= MAX_RECENT_POSTS; i++) await publisher.createPost({ text: `post ${i}` })
    const { olderPosts } = publisher.current.manifest
    expect(olderPosts).toBeDefined()
    expect(readPostPage(kubo.block(olderPosts)).posts.length).toBeGreaterThan(0)
  })

  it('updates and clears profile fields', async () => {
    const publisher = make()
    await publisher.init('Alice')
    await publisher.updateProfile({ bio: 'hello', website: 'https://example.com' })
    await publisher.updateProfile({ bio: null })
    expect(publisher.current.manifest.profile).toEqual({ displayName: 'Alice', website: 'https://example.com' })
  })

  it('likes and unlikes posts', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const { post } = await publisher.createPost({ text: 'nice' })
    await publisher.like(post.toString())
    expect(publisher.current.manifest.likes).toEqual([post])
    await publisher.unlike(post.toString())
    expect(publisher.current.manifest.likes).toBeUndefined()
  })

  it('creates reposts and records mentions', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const { post: original } = await publisher.createPost({ text: 'original' })
    const bob = identityFromSecretKey(generateSecretKey()).did
    const { post } = await publisher.createPost({ text: '', repostOf: original.toString(), mentions: [bob, bob] })
    const read = readPost(kubo.block(post))
    expect(read.repostOf).toEqual(original)
    expect(read.mentions).toEqual([bob])
  })

  it('deletes a recent post, unpins it and clears its pin', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const { post } = await publisher.createPost({ text: 'oops' })
    await publisher.pin(post.toString())
    await publisher.deletePost(post.toString())
    expect(publisher.current.manifest.posts).toEqual([])
    expect(publisher.current.manifest.pinned).toBeUndefined()
    expect(kubo.unpinned).toEqual([post])
  })

  it('deletes a post that has moved into an older page', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const posts = []
    for (let i = 0; i < MAX_RECENT_POSTS + 30; i++) posts.push((await publisher.createPost({ text: `post ${i}` })).post)
    const oldest = posts[0]
    if (!oldest) throw new Error('no posts')
    await publisher.deletePost(oldest.toString())

    // Walk the whole chain: every post but the deleted one is still reachable.
    const reachable = [...publisher.current.manifest.posts]
    for (let next = publisher.current.manifest.olderPosts; next; ) {
      const page = readPostPage(kubo.block(next))
      reachable.push(...page.posts)
      next = page.prev
    }
    expect(reachable).toHaveLength(posts.length - 1)
    expect(reachable.some((c) => c.equals(oldest))).toBe(false)
  })

  it('refuses to delete a post that is not yours', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const stranger = await kubo.putBlock(new TextEncoder().encode('{}'))
    await expect(publisher.deletePost(stranger.toString())).rejects.toThrow(NotFoundError)
  })

  it('sends encrypted messages that only the recipient can read', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const bob = identityFromSecretKey(generateSecretKey())
    const { message } = await publisher.sendMessage(bob.did, 'secret plans')
    await publisher.sendMessage(bob.did, 'more plans')

    const head = readMessagePage(kubo.block(publisher.current.manifest.messages))
    expect(head.messages).toHaveLength(2)
    expect(head.messages[1]).toEqual(message)
    const sealed = readMessage(kubo.block(message))
    expect(new TextDecoder().decode(kubo.block(message))).not.toContain('secret')
    expect(openMessage(conversationWith(bob.secretKey, bob.did, identity.did), identity.did, sealed)?.text).toBe(
      'secret plans',
    )
  })

  it('hands out the same conversation tag the other side derives', async () => {
    const publisher = make()
    await publisher.init('Alice')
    const bob = identityFromSecretKey(generateSecretKey())
    const keys = publisher.conversationKeys([bob.did])
    expect(keys[bob.did]?.tag).toBe(conversationWith(bob.secretKey, bob.did, identity.did).tag)
  })

  it('rejects empty messages', async () => {
    const publisher = make()
    await publisher.init('Alice')
    expect(() => publisher.sendMessage(identity.did, '  ')).toThrow(RangeError)
  })

  it('recovers an existing profile from the network instead of starting blank', async () => {
    kubo.keyNames.set('socialkey', identity.ipnsName)
    const original = make()
    await original.init('Alice')
    await original.updateProfile({ bio: 'my real profile' })
    const { post } = await original.createPost({ text: 'still here' })

    // Same key, but the local state is gone (new computer, reinstall, restore).
    stateFile = join(await mkdtemp(join(tmpdir(), 'socialkey-')), 'manifest.dagjson')
    const restored = make()
    await restored.init('Anonymous', { recover: true })
    expect(restored.current.manifest.profile.bio).toBe('my real profile')
    expect(restored.current.manifest.posts).toEqual([post])
  })

  it('starts blank when there is nothing to recover', async () => {
    const publisher = make()
    await publisher.init('Fresh', { recover: true })
    expect(publisher.current.manifest.profile.displayName).toBe('Fresh')
  })
})
