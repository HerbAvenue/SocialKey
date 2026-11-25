import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyManifest, encode, generateSecretKey, identityFromSecretKey, type Manifest, sign } from '@socialkey/core'
import { describe, expect, it } from 'vitest'
import { Live } from '../src/live'
import { Publisher } from '../src/publisher'
import { FakeKubo } from './fake-kubo'

describe('Live', () => {
  it("hears a followed person's new manifest within the same tick it's announced", async () => {
    const kubo = new FakeKubo()
    const alice = identityFromSecretKey(generateSecretKey())
    const announcer = new Live(kubo)
    const listener = new Live(kubo)
    const alicePublisher = new Publisher({
      kubo,
      identity: alice,
      keyName: 'alice',
      stateFile: join(await mkdtemp(join(tmpdir(), 'socialkey-live-')), 'm.dagjson'),
      onCommitted: (cid) => void announcer.announce(alice.ipnsName, cid),
    })
    await alicePublisher.init('Alice')
    listener.follow([alice.did])
    await new Promise((resolve) => setTimeout(resolve, 0))

    await alicePublisher.createPost({ text: 'live!' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(listener.latest()[alice.did]).toBe(alicePublisher.current.cid.toString())
    listener.stop()
  })

  it('rejects forged, stale and malformed announcements', async () => {
    const kubo = new FakeKubo()
    const alice = identityFromSecretKey(generateSecretKey())
    const mallory = identityFromSecretKey(generateSecretKey())
    const live = new Live(kubo)
    const put = async (identity: typeof alice, updatedAt: string) =>
      kubo.putBlock(encode(sign<Manifest>({ ...emptyManifest(identity.did, 'x', new Date(updatedAt)) }, identity)))
    const newer = await put(alice, '2026-02-01T00:00:00Z')
    const older = await put(alice, '2026-01-01T00:00:00Z')
    const forged = await put(mallory, '2026-03-01T00:00:00Z')
    const bytes = (s: string) => new TextEncoder().encode(s)

    expect(await live.receive(alice.did, bytes(forged.toString()))).toBe(false)
    expect(await live.receive(alice.did, bytes('not a cid'))).toBe(false)
    expect(await live.receive(alice.did, bytes(newer.toString()))).toBe(true)
    expect(await live.receive(alice.did, bytes(older.toString()))).toBe(false)
    expect(live.latest()[alice.did]).toBe(newer.toString())
  })
})
