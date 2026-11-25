import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  cidOf,
  emptyManifest,
  encode,
  generateSecretKey,
  identityFromSecretKey,
  type Manifest,
  sign,
} from '@socialkey/core'
import { describe, expect, it } from 'vitest'
import { Warmer } from '../src/warmer'

describe('Warmer', () => {
  it('requests the IPNS record, new blocks and images once each', async () => {
    const seen: string[] = []
    const server = createServer((req, res) => {
      seen.push(req.url ?? '')
      res.end('ok')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const me = identityFromSecretKey(generateSecretKey())
    const [post, image, manifestCid] = await Promise.all([
      cidOf(encode({ p: 1 })),
      cidOf(encode({ i: 1 })),
      cidOf(encode({ m: 1 })),
    ])
    const manifest = sign<Manifest>({ ...emptyManifest(me.did, 'Me', new Date()), posts: [post] }, me)
    const warmer = new Warmer({ gateways: [url], routers: [url] })
    const run = (cid = manifestCid) => warmer.warmNow(me.ipnsName, cid, manifest, async () => [image])

    await run()
    expect(seen.some((u) => u.startsWith(`/routing/v1/ipns/${me.ipnsName}`))).toBe(true)
    expect(seen).toContain(`/ipfs/${manifestCid}?format=raw`)
    expect(seen).toContain(`/ipfs/${post}?format=raw`)
    expect(seen).toContain(`/ipfs/${image}`)

    // A later publish only warms what's new; the record is always refreshed.
    seen.length = 0
    const next = await cidOf(encode({ m: 2 }))
    await run(next)
    expect(seen.filter((u) => u.startsWith('/ipfs/'))).toEqual([`/ipfs/${next}?format=raw`])
    expect(seen.some((u) => u.startsWith('/routing/v1/ipns/'))).toBe(true)
    server.close()
  })
})
