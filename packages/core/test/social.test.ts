import { describe, expect, it } from 'vitest'
import {
  cidOf,
  emptyManifest,
  encode,
  generateSecretKey,
  hashtags,
  identityFromSecretKey,
  like,
  MAX_LIKES,
  type Manifest,
  normalizeHandle,
  readManifest,
  removeRecentPost,
  resolveHandle,
  segmentText,
  setPinned,
  sign,
  unlike,
  verifyHandle,
} from '../src'

const alice = identityFromSecretKey(generateSecretKey())
const cid = (n: number) => cidOf(encode({ n }))

describe('likes, pins and deletion', () => {
  it('likes once, newest first, and unlikes', async () => {
    const [a, b] = [await cid(1), await cid(2)]
    let m = emptyManifest(alice.did, 'Alice', new Date())
    m = like(like(like(m, a), b), a)
    expect(m.likes).toEqual([b, a])
    m = unlike(unlike(m, a), b)
    expect(m.likes).toBeUndefined()
  })

  it('caps the like list', async () => {
    let m = emptyManifest(alice.did, 'Alice', new Date())
    for (let i = 0; i < MAX_LIKES + 5; i++) m = like(m, await cid(i))
    expect(m.likes).toHaveLength(MAX_LIKES)
  })

  it('removes a recent post and its pin, and signals older posts', async () => {
    const [a, b] = [await cid(1), await cid(2)]
    let m = { ...emptyManifest(alice.did, 'Alice', new Date()), posts: [a] }
    m = setPinned(m, a)
    const removed = removeRecentPost(m, a)
    expect(removed?.posts).toEqual([])
    expect(removed?.pinned).toBeUndefined()
    expect(removeRecentPost(m, b)).toBeNull()
  })

  it('round-trips a manifest with the new optional fields', async () => {
    const m = sign<Manifest>(
      {
        ...like(emptyManifest(alice.did, 'Alice', new Date()), await cid(1)),
        profile: { displayName: 'Alice', handle: 'alice.example.com' },
      },
      alice,
    )
    const read = readManifest(encode(m))
    expect(read.likes).toHaveLength(1)
    expect(read.profile.handle).toBe('alice.example.com')
  })
})

describe('domain handles', () => {
  const records: Record<string, string[]> = {
    '_socialkey.alice.example.com': [`"did=${alice.did}"`, 'v=spf1 -all'],
    '_socialkey.two.example.com': [`did=${alice.did}`, `did=${identityFromSecretKey(generateSecretKey()).did}`],
  }
  const lookup = async (name: string) => records[name] ?? []

  it('resolves and verifies a handle', async () => {
    expect(await resolveHandle('alice.example.com', lookup)).toBe(alice.did)
    expect(await verifyHandle('alice.example.com', alice.did, lookup)).toBe(true)
    expect(await verifyHandle('nobody.example.com', alice.did, lookup)).toBe(false)
  })

  it('treats conflicting records as unverified', async () => {
    expect(await resolveHandle('two.example.com', lookup)).toBeNull()
  })

  it('normalizes user input', () => {
    expect(normalizeHandle(' @Alice.Example.com. ')).toBe('alice.example.com')
    expect(normalizeHandle('not a domain')).toBeNull()
  })
})

describe('post text', () => {
  it('finds urls, hashtags and mentions', () => {
    const segments = segmentText('Hi @Bob, see https://example.com/a. #IPFS rocks #ipfs')
    expect(segments.filter((s) => s.kind !== 'text')).toEqual([
      { kind: 'mention', text: '@Bob', name: 'Bob' },
      { kind: 'url', text: 'https://example.com/a', href: 'https://example.com/a' },
      { kind: 'hashtag', text: '#IPFS', tag: 'ipfs' },
      { kind: 'hashtag', text: '#ipfs', tag: 'ipfs' },
    ])
    expect(segments.map((s) => s.text).join('')).toBe('Hi @Bob, see https://example.com/a. #IPFS rocks #ipfs')
    expect(hashtags('#a #A #b')).toEqual(['a', 'b'])
  })
})
