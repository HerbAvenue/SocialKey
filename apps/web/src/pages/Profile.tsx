import { type CID, didKey, type TimelineEntry } from '@socialkey/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { Avatar } from '../components/Avatar'
import { shortDid } from '../components/PostCard'
import { PostList } from '../components/PostList'
import { agent } from '../lib/agent'
import { fetchPosts, loadOlderPosts, useManifest, useMe } from '../lib/queries'

export function Profile() {
  const { did = '' } = useParams()
  if (!didKey.safeParse(did).success) return <p className="p-8 text-center">That isn't a valid did:key.</p>
  return <ProfileView key={did} did={did} />
}

function ProfileView({ did }: { did: string }) {
  const client = useQueryClient()
  const manifest = useManifest(did)
  const [older, setOlder] = useState<{ entries: TimelineEntry[]; next?: CID }>({ entries: [] })
  const recent = useQuery({
    queryKey: ['profile-posts', did, manifest.data?.posts.map(String)],
    enabled: manifest.data !== undefined,
    queryFn: () => fetchPosts(client, manifest.data?.posts ?? []),
  })
  const loadMore = useMutation({
    mutationFn: () => loadOlderPosts(client, (older.next ?? manifest.data?.olderPosts) as CID),
    onSuccess: (page) => setOlder((o) => ({ entries: [...o.entries, ...page.entries], next: page.next })),
  })

  if (manifest.isPending) return <p className="p-8 text-center text-stone-500">Resolving profile…</p>
  if (manifest.error) {
    return (
      <p className="p-8 text-center text-stone-500">
        This profile is unavailable right now: its owner's node may be offline.
        <br />
        <span className="text-sm">{manifest.error.message}</span>
      </p>
    )
  }

  const { profile, follows, olderPosts } = manifest.data
  const hasMore = older.entries.length === 0 ? olderPosts !== undefined : older.next !== undefined
  return (
    <>
      <section className="space-y-3 border-b border-stone-200 p-4 dark:border-stone-800">
        <div className="flex items-center gap-4">
          <Avatar cid={profile.avatar} name={profile.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{profile.displayName}</h1>
            <p className="truncate font-mono text-xs text-stone-500" title={did}>
              {shortDid(did)}
            </p>
          </div>
          <FollowButton did={did} />
        </div>
        {profile.bio && <p className="whitespace-pre-wrap">{profile.bio}</p>}
        <p className="flex flex-wrap gap-x-4 text-sm text-stone-500">
          {profile.location && <span>{profile.location}</span>}
          {profile.website && (
            <a href={profile.website} rel="noopener noreferrer nofollow" target="_blank" className="underline">
              {profile.website}
            </a>
          )}
          <span>Following {follows.length}</span>
        </p>
      </section>
      <PostList entries={[...(recent.data ?? []), ...older.entries]} empty="No posts yet." />
      {hasMore && (
        <button
          type="button"
          onClick={() => loadMore.mutate()}
          disabled={loadMore.isPending}
          className="w-full p-4 text-sm text-stone-600 hover:underline dark:text-stone-400"
        >
          {loadMore.isPending ? 'Loading…' : 'Load older posts'}
        </button>
      )}
    </>
  )
}

function FollowButton({ did }: { did: string }) {
  const client = useQueryClient()
  const me = useMe().data
  const own = useManifest(me?.did).data
  const toggle = useMutation({
    mutationFn: (following: boolean) => (following ? agent.unfollow(did) : agent.follow(did)),
    onSuccess: () => client.invalidateQueries({ queryKey: ['me'] }),
  })
  if (!me || !own || me.did === did) return null
  const following = own.follows.includes(did)
  return (
    <button
      type="button"
      onClick={() => toggle.mutate(following)}
      disabled={toggle.isPending}
      className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-semibold disabled:opacity-50 dark:border-stone-700"
    >
      {following ? 'Unfollow' : 'Follow'}
    </button>
  )
}
