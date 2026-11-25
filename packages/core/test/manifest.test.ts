import { describe, expect, it } from 'vitest'
import {
  type CID,
  cidOf,
  emptyManifest,
  encode,
  follow,
  generateSecretKey,
  identityFromSecretKey,
  MAX_RECENT_POSTS,
  type Manifest,
  POST_PAGE_SIZE,
  prependPost,
  readManifest,
  sign,
  type UnsignedManifest,
  withOlderPosts,
} from '../src'

const alice = identityFromSecretKey(generateSecretKey())
const fakeCid = (n: number): Promise<CID> => cidOf(encode({ n }))

describe('manifest', () => {
  it('signs and reads back an empty manifest', () => {
    const manifest = sign<Manifest>(emptyManifest(alice.did, 'Alice', new Date()), alice)
    expect(readManifest(encode(manifest)).profile.displayName).toBe('Alice')
  })

  it('rolls the oldest posts into a page when the recent list overflows', async () => {
    let manifest: UnsignedManifest = emptyManifest(alice.did, 'Alice', new Date())
    const cids: CID[] = []
    let pages = 0
    for (let i = 0; i < MAX_RECENT_POSTS + 1; i++) {
      const cid = await fakeCid(i)
      cids.push(cid)
      const result = prependPost(manifest, cid)
      manifest = result.manifest
      if (result.overflow) {
        pages++
        expect(result.overflow.posts).toEqual(cids.slice(0, POST_PAGE_SIZE).reverse())
        expect(result.overflow.prev).toBeUndefined()
        manifest = withOlderPosts(manifest, await cidOf(encode(result.overflow)))
      }
    }
    expect(pages).toBe(1)
    expect(manifest.posts).toHaveLength(MAX_RECENT_POSTS + 1 - POST_PAGE_SIZE)
    expect(manifest.posts[0]).toEqual(cids.at(-1))
    expect(manifest.olderPosts).toBeDefined()
  })

  it('does not follow yourself or the same user twice', () => {
    const bob = identityFromSecretKey(generateSecretKey())
    let manifest = emptyManifest(alice.did, 'Alice', new Date())
    manifest = follow(follow(follow(manifest, bob.did), bob.did), alice.did)
    expect(manifest.follows).toEqual([bob.did])
  })
})
