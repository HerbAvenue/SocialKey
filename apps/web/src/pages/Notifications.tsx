import { AtSign, Bell, Heart, MessageCircle, Repeat2, UserPlus } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useApp } from '../components/AppContext'
import { Avatar } from '../components/Avatar'
import { PostCard, usePerson } from '../components/PostCard'
import { EmptyState, PageHeader, Spinner } from '../components/ui'
import { useExtendedNetwork, useMe, useOwnManifest, usePost } from '../lib/queries'
import { type Notification, notificationsFor } from '../lib/social'
import { timeAgo } from '../lib/time'

const SEEN_KEY = 'socialkey.notificationsSeen'

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function useNotifications(): Notification[] {
  const { network } = useApp()
  const own = useOwnManifest()
  return useMemo(() => (network && own ? notificationsFor(network, own, own.posts) : []), [network, own])
}

export function useUnreadCount(): number {
  const notifications = useNotifications()
  const [seen, setSeen] = useState(readSeen)
  useEffect(() => {
    const update = () => setSeen(readSeen())
    window.addEventListener('socialkey:seen', update)
    return () => window.removeEventListener('socialkey:seen', update)
  }, [])
  return notifications.filter((n) => n.at > seen).length
}

export function Notifications() {
  const me = useMe().data
  const extended = useExtendedNetwork()
  const notifications = useNotifications()
  const [seenBefore] = useState(readSeen)

  useEffect(() => {
    const latest = notifications[0]?.at
    if (!latest) return
    try {
      localStorage.setItem(SEEN_KEY, latest)
    } catch {
      // Storage unavailable: the badge just won't clear across reloads.
    }
    window.dispatchEvent(new Event('socialkey:seen'))
  }, [notifications])

  if (!me) return null
  return (
    <>
      <PageHeader title="Notifications" subtitle="From people within two follows of you" />
      {notifications.length === 0 ? (
        extended.isPending ? (
          <Spinner label="Checking your network…" />
        ) : (
          <EmptyState icon={<Bell className="size-7" />} title="Nothing yet">
            When people in your network reply to you, mention you, like or repost your posts, or follow you, it shows up
            here.
          </EmptyState>
        )
      ) : (
        notifications.map((n) => <NotificationRow key={n.id} notification={n} unread={n.at > seenBefore} />)
      )}
    </>
  )
}

function NotificationRow({ notification: n, unread }: { notification: Notification; unread: boolean }) {
  if (n.kind === 'reply' || n.kind === 'mention') {
    return (
      <div className={unread ? 'bg-brand-50/50 dark:bg-brand-600/5' : ''}>
        <PostCard entry={n.entry} />
      </div>
    )
  }
  const icon: Record<string, ReactNode> = {
    like: <Heart className="size-6 fill-rose-500 text-rose-500" />,
    repost: <Repeat2 className="size-6 text-emerald-500" />,
    follow: <UserPlus className="size-6 text-brand-500" />,
    mention: <AtSign className="size-6" />,
    reply: <MessageCircle className="size-6" />,
  }
  const verb = { like: 'liked your post', repost: 'reposted your post', follow: 'followed you' }[n.kind]
  const post = n.kind === 'like' ? n.post : n.kind === 'repost' ? n.entry.post.repostOf : undefined
  return (
    <div
      className={`flex gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800 ${unread ? 'bg-brand-50/50 dark:bg-brand-600/5' : ''}`}
    >
      <div className="w-10 shrink-0 pt-1 text-right">{icon[n.kind]}</div>
      <div className="min-w-0 flex-1">
        <Actor did={n.from} />
        <p className="mt-1 text-[15px]">
          <ActorName did={n.from} /> {verb} <span className="text-stone-500">· {timeAgo(n.at)}</span>
        </p>
        {post && <PostSnippet cid={post.toString()} />}
      </div>
    </div>
  )
}

function Actor({ did }: { did: string }) {
  const person = usePerson(did)
  return (
    <Link to={`/u/${did}`}>
      <Avatar cid={person.avatar} name={person.name} seed={did} size="sm" />
    </Link>
  )
}

function ActorName({ did }: { did: string }) {
  const person = usePerson(did)
  return (
    <Link to={`/u/${did}`} className="font-bold hover:underline">
      {person.name}
    </Link>
  )
}

function PostSnippet({ cid }: { cid: string }) {
  const post = usePost(cid).data
  if (!post) return null
  return (
    <Link to={`/p/${cid}`} className="mt-1 line-clamp-2 block text-sm text-stone-500 hover:underline">
      {post.text || `${post.media.length} image${post.media.length === 1 ? '' : 's'}`}
    </Link>
  )
}
