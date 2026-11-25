import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateSecretKey,
  identityFromSecretKey,
  MAX_RECENT_POSTS,
  readManifest,
  readPost,
  readPostPage,
} from '@socialkey/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { Publisher } from '../src/publisher'
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
})
