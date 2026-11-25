import { CID, type Manifest, mergeTimeline, type TimelineEntry } from '@socialkey/core'
import { keepPreviousData, type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { agent, getToken } from './agent'
import { didForHandle } from './dns'
import { loadManifest, loadPost, loadPostPage, mediaUrls, setLocalGateway } from './ipfs'
import { mergeNetworks, type Network, type Person } from './social'

const POSTS_PER_FOLLOW = 20
const POSTS_PER_EXTENDED = 5
// Friends of friends loaded for Explore and notifications; each is an IPNS lookup.
const MAX_EXTENDED_PEOPLE = 120
const CONCURRENCY = 12
const MANIFEST_TTL = 60_000
const NETWORK_TTL = 5 * 60_000

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await agent.me()
      // Set before `me` reaches any component, so no fetch can start on the wrong gateways.
      setLocalGateway(me.gateway)
      return me
    },
    enabled: getToken() !== null,
    retry: false,
  })
}

function manifestQuery(did: string, cid?: string) {
  return {
    queryKey: ['manifest', did, cid ?? 'ipns'],
    queryFn: ({ signal }: { signal: AbortSignal }) => loadManifest(did, cid, signal),
    staleTime: MANIFEST_TTL,
  }
}

export function postQuery(cid: string) {
  return {
    queryKey: ['post', cid],
    queryFn: ({ signal }: { signal: AbortSignal }) => loadPost(cid, signal),
    // Posts are immutable: cached forever by CID.
    staleTime: Number.POSITIVE_INFINITY,
  }
}

/** A user's manifest; your own is read by the CID the agent reports, skipping IPNS. */
export function useManifest(did: string | undefined) {
  const me = useMe().data
  const live = useLive()
  // Your own newest manifest comes from the agent; other people's from PubSub when heard, else IPNS.
  const cid = did && did === me?.did ? me.manifestCid : did ? live[did] : undefined
  return useQuery({
    ...manifestQuery(did ?? '', cid),
    enabled: did !== undefined,
    // After you post or like, your manifest CID changes; keep showing the old one until the new one loads.
    placeholderData: (previous) => (previous?.author === did ? keepPreviousData(previous) : undefined),
  })
}

/** Your own manifest, or undefined when not paired. */
export function useOwnManifest(): Manifest | undefined {
  return useManifest(useMe().data?.did).data
}

export function usePost(cid: string | undefined) {
  return useQuery({ ...postQuery(cid ?? ''), enabled: cid !== undefined })
}

/**
 * An image URL that moves on to the next gateway when the current one fails.
 * Wire `onError` to the <img>; `url` is undefined once every gateway has failed.
 */
export function useMediaUrl(cid: string): { url: string | undefined; onError: () => void } {
  // Read `me` so the URLs switch to the local gateway once pairing completes.
  const gateway = useMe().data?.gateway
  // biome-ignore lint/correctness/useExhaustiveDependencies: mediaUrls reads the module-level gateway that pairing sets
  const urls = useMemo(() => mediaUrls(cid), [cid, gateway])
  const [attempt, setAttempt] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: start again from the best gateway when the list changes
  useEffect(() => setAttempt(0), [urls])
  return { url: urls[attempt], onError: () => setAttempt((a) => a + 1) }
}

export interface ModerationState {
  muted: Set<string>
  blocked: Set<string>
  /** True for people whose posts you shouldn't see. */
  hidden: (did: string) => boolean
}

const NOBODY: ModerationState = { muted: new Set(), blocked: new Set(), hidden: () => false }

/** Your private mute and block lists, kept by your agent. */
export function useModeration(): ModerationState {
  const me = useMe().data
  const lists = useQuery({
    queryKey: ['moderation'],
    queryFn: agent.moderation,
    enabled: me !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  }).data
  return useMemo(() => {
    if (!lists) return NOBODY
    const muted = new Set(lists.muted)
    const blocked = new Set(lists.blocked)
    return { muted, blocked, hidden: (did: string) => muted.has(did) || blocked.has(did) }
  }, [lists])
}

/** Resolves a domain handle to a did:key through DNS. */
export function useHandle(handle: string | undefined) {
  return useQuery({
    queryKey: ['handle', handle],
    queryFn: () => didForHandle(handle ?? ''),
    enabled: handle !== undefined,
    staleTime: 10 * 60_000,
  })
}

/** True when the profile's claimed handle has a DNS record pointing back at it. */
export function useVerifiedHandle(manifest: Manifest | undefined): string | undefined {
  const handle = manifest?.profile.handle
  const resolved = useHandle(handle).data
  return handle && resolved === manifest?.author ? handle : undefined
}

/** Loads posts by CID, skipping any that fail to fetch or verify. */
export async function fetchPosts(client: QueryClient, cids: CID[]): Promise<TimelineEntry[]> {
  const results = await mapSettled(cids, CONCURRENCY, async (cid) => ({
    cid,
    post: await client.fetchQuery(postQuery(cid.toString())),
  }))
  return results.filter((r) => r !== undefined)
}

/** Runs `fn` over items, at most `limit` at a time; failures become undefined. */
async function mapSettled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i] as T).catch(() => undefined)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function loadPeople(
  client: QueryClient,
  dids: string[],
  depth: 1 | 2,
  postsEach: number,
  live: Record<string, string> = {},
): Promise<Network> {
  const manifests = await mapSettled(dids, CONCURRENCY, (did) => client.fetchQuery(manifestQuery(did, live[did])))
  const people = new Map<string, Person>()
  manifests.forEach((manifest, i) => {
    const did = dids[i]
    if (manifest && did) people.set(did, { did, manifest, depth })
  })
  const posts = await fetchPosts(
    client,
    [...people.values()].flatMap((p) => p.manifest.posts.slice(0, postsEach)),
  )
  return { people, posts: mergeTimeline([posts]) }
}

/** You and everyone you follow, with their recent posts. Feeds the home timeline. */
/**
 * Newest manifest CIDs your agent has heard over PubSub (already verified there).
 * Polled often: it's a cheap local call, and it's how new posts appear within seconds.
 */
export function useLive(): Record<string, string> {
  const me = useMe().data
  return (
    useQuery({
      queryKey: ['live'],
      queryFn: agent.live,
      enabled: me !== undefined,
      refetchInterval: 10_000,
      retry: false,
    }).data?.latest ?? EMPTY_LIVE
  )
}

const EMPTY_LIVE: Record<string, string> = {}

export function useCircle() {
  const client = useQueryClient()
  const own = useOwnManifest()
  const live = useLive()
  return useQuery({
    // Keyed by who you follow, not your manifest CID: liking a post shouldn't reload everyone.
    // Live CIDs are in the key so a PubSub update refetches the circle right away.
    queryKey: ['network', 'circle', own?.author, own?.follows.map((did) => `${did}@${live[did] ?? ''}`).join(',')],
    enabled: own !== undefined,
    staleTime: MANIFEST_TTL,
    // New posts from people you follow show up without reloading.
    refetchInterval: 2 * MANIFEST_TTL,
    queryFn: async (): Promise<Network> => {
      if (!own) return { people: new Map(), posts: [] }
      return loadPeople(client, own.follows, 1, POSTS_PER_FOLLOW, live)
    },
  })
}

/** Your circle plus friends of friends. Feeds Explore, notifications and search. */
export function useExtendedNetwork() {
  const client = useQueryClient()
  const own = useOwnManifest()
  const circle = useCircle().data
  return useQuery({
    queryKey: ['network', 'extended', own?.author, own?.follows.join(',')],
    enabled: own !== undefined && circle !== undefined,
    staleTime: NETWORK_TTL,
    queryFn: async (): Promise<Network> => {
      if (!own || !circle) return { people: new Map(), posts: [] }
      const known = new Set([own.author, ...circle.people.keys()])
      const counts = new Map<string, number>()
      for (const person of circle.people.values()) {
        for (const did of person.manifest.follows) if (!known.has(did)) counts.set(did, (counts.get(did) ?? 0) + 1)
      }
      const candidates = [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_EXTENDED_PEOPLE)
      const extended = await loadPeople(
        client,
        candidates.map(([did]) => did),
        2,
        POSTS_PER_EXTENDED,
      )
      return mergeNetworks(circle, extended)
    },
  })
}

/** Your own recent posts. */
export function useOwnPosts() {
  const client = useQueryClient()
  const own = useOwnManifest()
  return useQuery({
    queryKey: ['own-posts', own?.posts.map(String).join(',')],
    enabled: own !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => fetchPosts(client, own?.posts ?? []),
  })
}

/** Everything loaded so far: you, your circle and (once loaded) friends of friends. */
export function useKnownNetwork(): Network | undefined {
  const own = useOwnManifest()
  const ownPosts = useOwnPosts().data
  const circle = useCircle().data
  const extended = useExtendedNetwork().data
  if (!own || !circle) return undefined
  const self: Network = {
    people: new Map([[own.author, { did: own.author, manifest: own, depth: 0 }]]),
    posts: ownPosts ?? [],
  }
  return mergeNetworks(self, extended ?? circle)
}

/** A profile's posts: the recent list, then older pages on demand. */
export async function loadOlderPosts(
  client: QueryClient,
  page: CID,
): Promise<{ entries: TimelineEntry[]; next?: CID }> {
  const { posts, prev } = await loadPostPage(page)
  return { entries: await fetchPosts(client, posts), next: prev }
}

export function parseCid(value: string | undefined): CID | undefined {
  try {
    return value ? CID.parse(value) : undefined
  } catch {
    return undefined
  }
}
