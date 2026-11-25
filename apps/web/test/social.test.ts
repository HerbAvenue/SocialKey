import {
  type CID,
  cidOf,
  emptyManifest,
  encode,
  generateSecretKey,
  type Identity,
  identityFromSecretKey,
  type Manifest,
  type Post,
  sign,
  type TimelineEntry,
} from '@socialkey/core'
import { describe, expect, it } from 'vitest'
import { type Network, notificationsFor, type Person, search, suggestPeople, trendingTags } from '../src/lib/social'
import { timeAgo } from '../src/lib/time'

const [me, ada, ben, cat, dan] = Array.from({ length: 5 }, () => identityFromSecretKey(generateSecretKey()))
if (!me || !ada || !ben || !cat || !dan) throw new Error('identities')

function manifest(identity: Identity, name: string, extra: Partial<Manifest> = {}): Manifest {
  return sign<Manifest>({ ...emptyManifest(identity.did, name, new Date('2026-01-01')), ...extra }, identity)
}

async function entry(
  identity: Identity,
  text: string,
  extra: Partial<Post> = {},
  createdAt = new Date().toISOString(),
): Promise<TimelineEntry> {
  const post = sign<Post>(
    { type: 'post', version: 1, author: identity.did, createdAt, text, media: [], ...extra },
    identity,
  )
  return { cid: await cidOf(encode(post)), post }
}

function network(people: Person[], posts: TimelineEntry[] = []): Network {
  return { people: new Map(people.map((p) => [p.did, p])), posts }
}

describe('suggestPeople', () => {
  it('ranks friends of friends by how many of your follows follow them', () => {
    const mine = manifest(me, 'Me', { follows: [ada.did, ben.did] })
    const net = network([
      { did: ada.did, depth: 1, manifest: manifest(ada, 'Ada', { follows: [cat.did, dan.did, me.did] }) },
      { did: ben.did, depth: 1, manifest: manifest(ben, 'Ben', { follows: [cat.did] }) },
      { did: cat.did, depth: 2, manifest: manifest(cat, 'Cat') },
      { did: dan.did, depth: 2, manifest: manifest(dan, 'Dan') },
    ])
    const suggestions = suggestPeople(net, mine)
    expect(suggestions.map((s) => s.person.did)).toEqual([cat.did, dan.did])
    expect(suggestions[0]?.mutuals.map((m) => m.did)).toEqual([ada.did, ben.did])
  })
})

describe('notificationsFor', () => {
  it('finds replies, reposts, mentions, likes and follows', async () => {
    const myPost = await entry(me, 'hello')
    const reply = await entry(ada, 'hi!', { replyTo: myPost.cid })
    const repost = await entry(ben, '', { repostOf: myPost.cid })
    const mention = await entry(cat, 'cc @me', { mentions: [me.did] })
    const unrelated = await entry(dan, 'nothing to do with you')
    const mine = manifest(me, 'Me', { posts: [myPost.cid] })
    const net = network(
      [
        { did: ada.did, depth: 1, manifest: manifest(ada, 'Ada', { follows: [me.did], likes: [myPost.cid] }) },
        { did: ben.did, depth: 1, manifest: manifest(ben, 'Ben') },
      ],
      [myPost, reply, repost, mention, unrelated],
    )
    const kinds = notificationsFor(net, mine, [myPost.cid]).map(
      (n) => `${n.kind}:${n.from === ada.did ? 'ada' : n.from === ben.did ? 'ben' : 'cat'}`,
    )
    expect(kinds.sort()).toEqual(['follow:ada', 'like:ada', 'mention:cat', 'reply:ada', 'repost:ben'])
  })

  it('ignores your own activity', async () => {
    const myPost = await entry(me, 'hello')
    const selfReply = await entry(me, 'replying to myself', { replyTo: myPost.cid })
    const mine = manifest(me, 'Me', { posts: [myPost.cid], likes: [myPost.cid] })
    const net = network([{ did: me.did, depth: 0, manifest: mine }], [myPost, selfReply])
    expect(notificationsFor(net, mine, [myPost.cid])).toEqual([])
  })
})

describe('trendingTags', () => {
  it('ranks by distinct people, then posts, and skips old posts', async () => {
    const now = Date.parse('2026-06-10T00:00:00Z')
    const recent = new Date(now - 86_400_000).toISOString()
    const old = new Date(now - 30 * 86_400_000).toISOString()
    const posts = [
      await entry(ada, '#ipfs #cats', {}, recent),
      await entry(ben, '#IPFS rocks', {}, recent),
      await entry(ada, '#cats again #cats', {}, recent),
      await entry(cat, '#ancient', {}, old),
    ]
    expect(trendingTags(posts, now)).toEqual([
      { tag: 'ipfs', posts: 2, people: 2 },
      { tag: 'cats', posts: 2, people: 1 },
    ])
  })
})

describe('search', () => {
  it('matches names, bios and post text case-insensitively', async () => {
    const post = await entry(ben, 'Sourdough tips inside')
    const net = network(
      [
        {
          did: ada.did,
          depth: 1,
          manifest: manifest(ada, 'Ada Lovelace', { profile: { displayName: 'Ada Lovelace', bio: 'Engines' } }),
        },
        { did: ben.did, depth: 1, manifest: manifest(ben, 'Ben') },
      ],
      [post],
    )
    expect(search(net, 'lovelace').people.map((p) => p.did)).toEqual([ada.did])
    expect(search(net, 'ENGINES').people).toHaveLength(1)
    expect(search(net, 'sourdough').posts.map((e) => e.cid as CID)).toEqual([post.cid])
    expect(search(net, '  ')).toEqual({ people: [], posts: [] })
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-06-10T12:00:00Z')
  it('uses short relative times, then dates', () => {
    expect(timeAgo('2026-06-10T11:59:50Z', now)).toBe('now')
    expect(timeAgo('2026-06-10T11:55:00Z', now)).toMatch(/^5\s?m/)
    expect(timeAgo('2026-06-10T09:00:00Z', now)).toMatch(/^3\s?h/)
    expect(timeAgo('2026-06-01T12:00:00Z', now)).not.toMatch(/2026/)
    expect(timeAgo('2025-06-01T12:00:00Z', now)).toMatch(/2025/)
  })
})
