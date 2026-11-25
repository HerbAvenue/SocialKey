import { type CID, didKey, normalizeHandle, type TimelineEntry } from '@socialkey/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Ban,
  Copy,
  Link as LinkIcon,
  LoaderCircle,
  Mail,
  MapPin,
  Pin,
  QrCode as QrIcon,
  Share,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useApp } from '../components/AppContext'
import { Avatar } from '../components/Avatar'
import { MediaImage } from '../components/MediaImage'
import { FollowButton, UserRow } from '../components/People'
import { Menu, PostCard, shortDid, useModerate } from '../components/PostCard'
import { PostList } from '../components/PostList'
import { PostText } from '../components/PostText'
import { QrCode } from '../components/QrCode'
import { Button, EmptyState, PageHeader, PostSkeleton, Spinner, Tabs } from '../components/ui'
import { copyText } from '../lib/clipboard'
import {
  fetchPosts,
  loadOlderPosts,
  useHandle,
  useManifest,
  useMe,
  useModeration,
  useVerifiedHandle,
} from '../lib/queries'
import { profileLink } from '../lib/share'
import { isRepost, knownFollowers } from '../lib/social'

/** `/u/:id` accepts a did:key or a domain handle. */
export function Profile() {
  const { id = '' } = useParams()
  const handle = didKey.safeParse(id).success ? null : normalizeHandle(id)
  const resolved = useHandle(handle ?? undefined)
  if (didKey.safeParse(id).success) return <ProfileView key={id} did={id} />
  if (!handle) return <EmptyState title="That isn't a SocialKey ID or handle" />
  if (resolved.isPending) return <Spinner label={`Looking up @${handle}…`} />
  if (!resolved.data)
    return (
      <EmptyState title={`No profile is linked to @${handle}`}>
        The domain needs a DNS TXT record for its owner's SocialKey ID.
      </EmptyState>
    )
  return <Navigate to={`/u/${resolved.data}`} replace />
}

type Tab = 'posts' | 'replies' | 'media' | 'likes'

function ProfileView({ did }: { did: string }) {
  const client = useQueryClient()
  const { network } = useApp()
  const me = useMe().data
  const manifest = useManifest(did)
  const handle = useVerifiedHandle(manifest.data)
  const moderation = useModeration()
  const moderate = useModerate()
  const [tab, setTab] = useState<Tab>('posts')
  const [older, setOlder] = useState<{ entries: TimelineEntry[]; next?: CID }>({ entries: [] })

  const recent = useQuery({
    queryKey: ['profile-posts', did, manifest.data?.posts.map(String).join(',')],
    enabled: manifest.data !== undefined,
    queryFn: () => fetchPosts(client, manifest.data?.posts ?? []),
  })
  const likes = useQuery({
    queryKey: ['profile-likes', did, manifest.data?.likes?.slice(0, 30).map(String).join(',')],
    enabled: tab === 'likes' && manifest.data !== undefined,
    queryFn: () => fetchPosts(client, manifest.data?.likes?.slice(0, 30) ?? []),
  })
  const loadMore = useMutation({
    mutationFn: () => loadOlderPosts(client, (older.next ?? manifest.data?.olderPosts) as CID),
    onSuccess: (page) => setOlder((o) => ({ entries: [...o.entries, ...page.entries], next: page.next })),
  })

  if (manifest.isPending) {
    return (
      <>
        <PageHeader title="Profile" back />
        <div className="h-36 animate-pulse bg-stone-200 dark:bg-stone-800" />
        <SlowLoadHint />
        <PostSkeleton />
      </>
    )
  }
  if (manifest.error) {
    return (
      <>
        <PageHeader title="Profile" back />
        <EmptyState icon={<WifiOff className="size-7" />} title="This profile is offline right now">
          Profiles are hosted by their owners. Their computer may be off, or the network hasn't found it yet. Try again
          later.
          <span className="mt-2 block font-mono text-xs break-all">{did}</span>
        </EmptyState>
      </>
    )
  }

  const m = manifest.data
  const { profile } = m
  const followers = network ? knownFollowers(network, did) : []
  const followsYou = me && me.did !== did && m.follows.includes(me.did)
  const all = [...(recent.data ?? []), ...older.entries]
  const pinned = m.pinned ? all.find((e) => e.cid.equals(m.pinned as CID)) : undefined
  const visible: Record<Tab, TimelineEntry[]> = {
    posts: all.filter((e) => !e.post.replyTo && !e.cid.equals(pinned?.cid as CID)),
    replies: all.filter((e) => e.post.replyTo),
    media: all.filter((e) => e.post.media.length > 0 && !isRepost(e.post)),
    likes: likes.data ?? [],
  }
  const hasMore = older.entries.length === 0 ? m.olderPosts !== undefined : older.next !== undefined

  return (
    <>
      <PageHeader title={profile.displayName} subtitle={`${m.posts.length}${m.olderPosts ? '+' : ''} posts`} back />
      <div className="relative h-36 bg-gradient-to-br from-brand-400 to-brand-700 sm:h-48">
        {profile.banner && <MediaImage cid={profile.banner.toString()} className="h-36 w-full sm:h-48" />}
      </div>
      <section className="px-4 pb-4">
        <div className="flex items-start justify-between">
          <Avatar
            cid={profile.avatar}
            name={profile.displayName}
            seed={did}
            size="xl"
            className="relative z-10 -mt-14 border-4 border-white dark:border-stone-950"
          />
          <div className="mt-3 flex items-center gap-2">
            <ShareMenu
              did={did}
              handle={handle}
              extra={
                me && me.did !== did
                  ? [
                      moderation.muted.has(did)
                        ? {
                            label: 'Unmute',
                            icon: <VolumeX className="size-4" />,
                            onClick: () => moderate('muted', did, false, profile.displayName),
                          }
                        : {
                            label: 'Mute',
                            icon: <VolumeX className="size-4" />,
                            onClick: () => moderate('muted', did, true, profile.displayName),
                          },
                      moderation.blocked.has(did)
                        ? {
                            label: 'Unblock',
                            icon: <Ban className="size-4" />,
                            onClick: () => moderate('blocked', did, false, profile.displayName),
                          }
                        : {
                            label: 'Block',
                            icon: <Ban className="size-4" />,
                            danger: true,
                            onClick: () => moderate('blocked', did, true, profile.displayName),
                          },
                    ]
                  : []
              }
            />
            {me?.did === did ? (
              <Link to="/settings">
                <Button variant="secondary">Edit profile</Button>
              </Link>
            ) : (
              <>
                {me && (
                  <Link
                    to={`/messages/${did}`}
                    aria-label="Message"
                    title="Message"
                    className="rounded-full border border-stone-300 p-2 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                  >
                    <Mail className="size-5" />
                  </Link>
                )}
                <FollowButton did={did} size="md" />
              </>
            )}
          </div>
        </div>
        <h1 className="mt-3 flex items-center gap-1.5 text-2xl font-extrabold">
          {profile.displayName}
          {handle && <BadgeCheck className="size-6 text-brand-500" aria-label="Verified handle" />}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-stone-500">
          <span className="font-mono text-sm" title={did}>
            {handle ? `@${handle}` : shortDid(did)}
          </span>
          {followsYou && (
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs font-semibold dark:bg-stone-800">
              Follows you
            </span>
          )}
        </p>
        {profile.bio && <PostText text={profile.bio} className="mt-3 text-[15px]" />}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
          {profile.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-4" /> {profile.location}
            </span>
          )}
          {profile.website && (
            <a
              href={profile.website}
              rel="noopener noreferrer nofollow me"
              target="_blank"
              className="flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
            >
              <LinkIcon className="size-4" /> {profile.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </a>
          )}
        </p>
        <p className="mt-3 flex gap-4 text-sm">
          <Link to={`/u/${did}/following`} className="hover:underline">
            <b>{m.follows.length}</b> <span className="text-stone-500">Following</span>
          </Link>
          {network && (
            <Link to={`/u/${did}/followers`} className="hover:underline" title="Followers among people in your network">
              <b>{followers.length}</b> <span className="text-stone-500">Followers you know</span>
            </Link>
          )}
        </p>
      </section>
      {moderation.hidden(did) && (
        <p className="border-y border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
          You {moderation.blocked.has(did) ? 'blocked' : 'muted'} this account. Their posts are hidden from your
          timeline, Explore and notifications.
        </p>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'posts', label: 'Posts' },
          { id: 'replies', label: 'Replies' },
          { id: 'media', label: 'Media' },
          { id: 'likes', label: 'Likes' },
        ]}
      />
      {tab === 'posts' && pinned && (
        <div>
          <p className="flex items-center gap-2 px-4 pt-2 pl-12 text-xs font-semibold text-stone-500">
            <Pin className="size-3.5" /> Pinned
          </p>
          <PostCard entry={pinned} />
        </div>
      )}
      {recent.isPending || (tab === 'likes' && likes.isPending) ? (
        <PostSkeleton />
      ) : (
        <PostList
          entries={visible[tab]}
          empty={
            { posts: 'No posts yet', replies: 'No replies yet', media: 'No photos yet', likes: 'No likes yet' }[tab]
          }
        />
      )}
      {hasMore && tab !== 'likes' && (
        <button
          type="button"
          onClick={() => loadMore.mutate()}
          disabled={loadMore.isPending}
          className="w-full p-4 text-sm font-semibold text-brand-600 hover:bg-stone-50 dark:text-brand-400 dark:hover:bg-stone-900"
        >
          {loadMore.isPending ? 'Loading…' : 'Show older posts'}
        </button>
      )}
    </>
  )
}

/** After a few seconds, explains why a profile is taking a while: it's being found on the network. */
function SlowLoadHint() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(timer)
  }, [])
  if (!slow) return null
  return (
    <p className="flex animate-fade-in items-center gap-2 border-b border-stone-200 px-4 py-3 text-sm text-stone-500 dark:border-stone-800">
      <LoaderCircle className="size-4 shrink-0 animate-spin text-brand-500" />
      Finding this profile on the IPFS network. The first visit can take up to a minute; after that it's quick.
    </p>
  )
}

function ShareMenu({
  did,
  handle,
  extra = [],
}: {
  did: string
  handle?: string
  extra?: Parameters<typeof Menu>[0]['items']
}) {
  const { toast } = useApp()
  const [qr, setQr] = useState(false)
  const link = profileLink(handle ?? did)
  useEffect(() => {
    if (!qr) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setQr(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [qr])
  return (
    <>
      <Menu
        trigger={(toggle) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Share profile"
            className="rounded-full border border-stone-300 p-2 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            <Share className="size-5" />
          </button>
        )}
        items={[
          {
            label: 'Copy profile link',
            icon: <LinkIcon className="size-4" />,
            onClick: async () => {
              await copyText(link)
              toast('Link copied')
            },
          },
          {
            label: 'Copy SocialKey ID',
            icon: <Copy className="size-4" />,
            onClick: async () => {
              await copyText(did)
              toast('ID copied')
            },
          },
          { label: 'Show QR code', icon: <QrIcon className="size-4" />, onClick: () => setQr(true) },
          ...extra,
        ]}
      />
      {qr && (
        // biome-ignore lint/a11y/noStaticElementInteractions: clicking the backdrop closes the dialog; Escape does too
        <div
          role="presentation"
          className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setQr(false)}
        >
          <div className="relative w-full max-w-xs animate-slide-up rounded-2xl bg-white p-6 text-center dark:bg-stone-900">
            <button
              type="button"
              onClick={() => setQr(false)}
              className="absolute top-3 right-3 rounded-full p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
            <div className="inline-block rounded-2xl bg-white p-3">
              <QrCode value={link} size={220} />
            </div>
            <p className="mt-3 text-sm text-stone-500">Scan to open this profile</p>
          </div>
        </div>
      )}
    </>
  )
}

/** `/u/:id/following` and `/u/:id/followers`. */
export function FollowList({ kind }: { kind: 'following' | 'followers' }) {
  const { id = '' } = useParams()
  const { network } = useApp()
  const manifest = useManifest(id).data
  const dids =
    kind === 'following' ? (manifest?.follows ?? []) : network ? knownFollowers(network, id).map((p) => p.did) : []
  return (
    <>
      <PageHeader
        title={kind === 'following' ? 'Following' : 'Followers you know'}
        subtitle={manifest?.profile.displayName}
        back
      />
      {kind === 'followers' && (
        <p className="border-b border-stone-200 px-4 py-3 text-xs text-stone-500 dark:border-stone-800">
          There's no central list of followers on SocialKey. These are the people in your network who follow this
          account.
        </p>
      )}
      {dids.length === 0 ? <EmptyState title="Nobody here yet" /> : dids.map((did) => <UserRow key={did} did={did} />)}
    </>
  )
}
