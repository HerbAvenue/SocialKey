import type { CID, Manifest, TimelineEntry } from '@socialkey/core'
import { mergeTimeline } from '@socialkey/core'
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { agent, getToken } from './agent'
import { loadManifest, loadMediaUrl, loadPost, loadPostPage, setLocalGateway } from './ipfs'

const POSTS_PER_AUTHOR = 20
const MANIFEST_TTL = 60_000

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

function postQuery(cid: string) {
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
  const cid = did && did === me?.did ? me.manifestCid : undefined
  return useQuery({ ...manifestQuery(did ?? '', cid), enabled: did !== undefined })
}

export function useMediaUrl(cid: string) {
  const query = useQuery({
    queryKey: ['media', cid],
    queryFn: ({ signal }) => loadMediaUrl(cid, signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  })
  return query.data
}

/** Loads posts by CID, skipping any that fail to fetch or verify. */
export async function fetchPosts(client: QueryClient, cids: CID[]): Promise<TimelineEntry[]> {
  const results = await Promise.allSettled(
    cids.map(async (cid) => ({ cid, post: await client.fetchQuery(postQuery(cid.toString())) })),
  )
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
}

/** Your posts plus the recent posts of everyone you follow, newest first. */
export function useTimeline(me: { did: string; manifestCid: string } | undefined, own: Manifest | undefined) {
  const client = useQueryClient()
  return useQuery({
    queryKey: ['timeline', me?.manifestCid],
    enabled: me !== undefined && own !== undefined,
    staleTime: MANIFEST_TTL,
    queryFn: async () => {
      if (!own) return []
      // A profile that fails to resolve or verify is skipped, never fatal.
      const others = await Promise.allSettled(own.follows.map((did) => client.fetchQuery(manifestQuery(did))))
      const manifests = [own, ...others.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))]
      const lists = await Promise.all(manifests.map((m) => fetchPosts(client, m.posts.slice(0, POSTS_PER_AUTHOR))))
      return mergeTimeline(lists)
    },
  })
}

/** Follows a profile's `olderPosts` chain one page at a time. */
export async function loadOlderPosts(
  client: QueryClient,
  page: CID,
): Promise<{ entries: TimelineEntry[]; next?: CID }> {
  const { posts, prev } = await loadPostPage(page)
  return { entries: await fetchPosts(client, posts), next: prev }
}
