import { type CID, hashtags, type Manifest, mergeTimeline, type Post, type TimelineEntry } from '@socialkey/core'

/** Someone whose manifest we loaded, and how far they are from you in the follow graph. */
export interface Person {
  did: string
  manifest: Manifest
  depth: 0 | 1 | 2
}

/** Everything loaded about your corner of the network. */
export interface Network {
  people: Map<string, Person>
  posts: TimelineEntry[]
}

export const emptyNetwork: Network = { people: new Map(), posts: [] }

export function mergeNetworks(...networks: Network[]): Network {
  const people = new Map<string, Person>()
  for (const n of networks) {
    for (const [did, person] of n.people) {
      const existing = people.get(did)
      if (!existing || person.depth < existing.depth) people.set(did, person)
    }
  }
  return { people, posts: mergeTimeline(networks.map((n) => n.posts)) }
}

const key = (cid: CID) => cid.toString()

/** People your follows follow (and you don't), ranked by how many of your follows do. */
export function suggestPeople(network: Network, me: Manifest): { person: Person; mutuals: Person[] }[] {
  const following = new Set(me.follows)
  const results = new Map<string, { person: Person; mutuals: Person[] }>()
  for (const did of me.follows) {
    const friend = network.people.get(did)
    if (!friend) continue
    for (const candidate of friend.manifest.follows) {
      if (candidate === me.author || following.has(candidate)) continue
      const person = network.people.get(candidate)
      if (!person) continue
      const entry = results.get(candidate) ?? { person, mutuals: [] }
      entry.mutuals.push(friend)
      results.set(candidate, entry)
    }
  }
  return [...results.values()].sort(
    (a, b) =>
      b.mutuals.length - a.mutuals.length || b.person.manifest.updatedAt.localeCompare(a.person.manifest.updatedAt),
  )
}

/** People in the loaded network who follow `did`. */
export function knownFollowers(network: Network, did: string): Person[] {
  return [...network.people.values()].filter((p) => p.did !== did && p.manifest.follows.includes(did))
}

export function likers(network: Network, cid: CID): Person[] {
  return [...network.people.values()].filter((p) => p.manifest.likes?.some((c) => c.equals(cid)))
}

export function repliesTo(posts: TimelineEntry[], cid: CID): TimelineEntry[] {
  return posts
    .filter((e) => e.post.replyTo?.equals(cid))
    .sort((a, b) => a.post.createdAt.localeCompare(b.post.createdAt))
}

export function repostsOf(posts: TimelineEntry[], cid: CID): TimelineEntry[] {
  return posts.filter((e) => e.post.repostOf?.equals(cid))
}

export type Notification =
  | { kind: 'reply' | 'mention' | 'repost'; id: string; at: string; from: string; entry: TimelineEntry }
  | { kind: 'like'; id: string; at: string; from: string; post: CID }
  | { kind: 'follow'; id: string; at: string; from: string }

/**
 * What happened to you, as far as your network can see: replies, mentions,
 * reposts and likes of your posts, and follows. There is no central server to
 * report everything, so this covers people within two follows of you.
 */
export function notificationsFor(network: Network, me: Manifest, myPosts: CID[]): Notification[] {
  const mine = new Set(myPosts.map(key))
  const out: Notification[] = []
  for (const entry of network.posts) {
    const { post, cid } = entry
    if (post.author === me.author) continue
    const base = { at: post.createdAt, from: post.author, entry }
    if (post.replyTo && mine.has(key(post.replyTo))) out.push({ kind: 'reply', id: `reply:${cid}`, ...base })
    else if (post.repostOf && mine.has(key(post.repostOf))) out.push({ kind: 'repost', id: `repost:${cid}`, ...base })
    else if (post.mentions?.includes(me.author)) out.push({ kind: 'mention', id: `mention:${cid}`, ...base })
  }
  for (const person of network.people.values()) {
    if (person.did === me.author) continue
    // Manifests don't record when each like or follow happened; their last update is the best guess.
    const at = person.manifest.updatedAt
    for (const liked of person.manifest.likes ?? []) {
      if (mine.has(key(liked)))
        out.push({ kind: 'like', id: `like:${person.did}:${liked}`, at, from: person.did, post: liked })
    }
    if (person.manifest.follows.includes(me.author))
      out.push({ kind: 'follow', id: `follow:${person.did}`, at, from: person.did })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** Hashtags used by the most different people in the last week. */
export function trendingTags(
  posts: TimelineEntry[],
  now = Date.now(),
): { tag: string; posts: number; people: number }[] {
  const since = new Date(now - 7 * 86_400_000).toISOString()
  const stats = new Map<string, { posts: number; people: Set<string> }>()
  for (const { post } of posts) {
    if (post.createdAt < since) continue
    for (const tag of hashtags(post.text)) {
      const s = stats.get(tag) ?? { posts: 0, people: new Set() }
      s.posts++
      s.people.add(post.author)
      stats.set(tag, s)
    }
  }
  return [...stats]
    .map(([tag, s]) => ({ tag, posts: s.posts, people: s.people.size }))
    .sort((a, b) => b.people - a.people || b.posts - a.posts)
}

export function postsWithTag(posts: TimelineEntry[], tag: string): TimelineEntry[] {
  return posts.filter((e) => hashtags(e.post.text).includes(tag.toLowerCase()))
}

/** Case-insensitive search over loaded posts and people. */
export function search(network: Network, query: string): { people: Person[]; posts: TimelineEntry[] } {
  const q = query.trim().toLowerCase()
  if (!q) return { people: [], posts: [] }
  const people = [...network.people.values()].filter((p) => {
    const { displayName, handle, bio } = p.manifest.profile
    return [displayName, handle, bio].some((v) => v?.toLowerCase().includes(q))
  })
  const posts = network.posts.filter((e) => e.post.text.toLowerCase().includes(q))
  return { people, posts }
}

export function isRepost(post: Post): boolean {
  return post.repostOf !== undefined && post.text === '' && post.media.length === 0
}
