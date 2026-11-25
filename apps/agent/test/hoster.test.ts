import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSecretKey, identityFromSecretKey } from '@socialkey/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { Hoster } from '../src/hoster'
import { Publisher } from '../src/publisher'
import { FakeKubo } from './fake-kubo'

describe('Hoster', () => {
  let kubo: FakeKubo
  let dir: string
  const friend = identityFromSecretKey(generateSecretKey())
  let friendPublisher: Publisher
  let follows: string[]

  beforeEach(async () => {
    kubo = new FakeKubo()
    dir = await mkdtemp(join(tmpdir(), 'socialkey-hoster-'))
    kubo.keyNames.set('friend', friend.ipnsName)
    friendPublisher = new Publisher({
      kubo,
      identity: friend,
      keyName: 'friend',
      stateFile: join(dir, 'friend.dagjson'),
    })
    await friendPublisher.init('Friend')
    await friendPublisher.flush()
    follows = [friend.did]
  })

  const makeHoster = () => new Hoster({ kubo, follows: () => follows, stateFile: join(dir, 'hosted.json') })

  it("pins a followed profile's manifest, posts and media, and re-announces its record", async () => {
    const image = await kubo.addFile(new Uint8Array([1, 2, 3]))
    const { post } = await friendPublisher.createPost({ text: 'hi', media: [image.toString()] })
    await friendPublisher.flush()
    const hoster = makeHoster()
    await hoster.runOnce()

    expect(kubo.pins.get(friendPublisher.current.cid.toString())).toBe('direct')
    expect(kubo.pins.get(post.toString())).toBe('direct')
    expect(kubo.pins.get(image.toString())).toBe('recursive')
    expect(kubo.reannounced).toEqual([friend.ipnsName])
    expect(hoster.status().profiles).toBe(1)
  })

  it('swaps pins when the profile changes and drops them on unfollow', async () => {
    const hoster = makeHoster()
    await hoster.runOnce()
    const first = friendPublisher.current.cid
    await friendPublisher.createPost({ text: 'new' })
    await friendPublisher.flush()
    await hoster.runOnce()
    expect(kubo.pins.has(first.toString())).toBe(false)
    expect(kubo.pins.has(friendPublisher.current.cid.toString())).toBe(true)

    follows = []
    await hoster.runOnce()
    expect(kubo.pins.size).toBe(0)
    expect(hoster.status().profiles).toBe(0)
  })

  it('remembers what it hosts across restarts', async () => {
    await makeHoster().runOnce()
    expect(kubo.pins.size).toBeGreaterThan(0)
    // A fresh Hoster that never hosted anything itself must still clean up after an unfollow.
    follows = []
    const restarted = makeHoster()
    await restarted.start()
    restarted.stop()
    await restarted.runOnce()
    expect(kubo.pins.size).toBe(0)
  })

  it('keeps going when one profile cannot be reached', async () => {
    const offline = identityFromSecretKey(generateSecretKey())
    follows = [offline.did, friend.did]
    const logs: string[] = []
    const hoster = new Hoster({
      kubo,
      follows: () => follows,
      stateFile: join(dir, 'hosted.json'),
      log: (m) => logs.push(m),
    })
    await hoster.runOnce()
    expect(logs).toHaveLength(1)
    expect(kubo.reannounced).toEqual([friend.ipnsName])
  })

  it("never unpins content it didn't pin itself", async () => {
    kubo.pinOnPut = true
    await friendPublisher.createPost({ text: 'already pinned by its owner' })
    await friendPublisher.flush()
    const hoster = makeHoster()
    await hoster.runOnce()
    follows = []
    await hoster.runOnce()
    expect(kubo.unpinned).toEqual([])
    expect(kubo.pins.get(friendPublisher.current.cid.toString())).toBe('recursive')
  })
})
