import type { CID, Post, TimelineEntry } from '@socialkey/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Ban,
  Ellipsis,
  Heart,
  Link as LinkIcon,
  MessageCircle,
  Pin,
  PinOff,
  Quote,
  Repeat2,
  Share,
  Trash,
  VolumeX,
} from 'lucide-react'
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { agent } from '../lib/agent'
import { useManifest, useMe, useOwnManifest, usePost, useVerifiedHandle } from '../lib/queries'
import { postLink } from '../lib/share'
import { isRepost, likers, repliesTo, repostsOf } from '../lib/social'
import { fullDate, timeAgo } from '../lib/time'
import { useApp } from './AppContext'
import { Avatar } from './Avatar'
import { MediaImage } from './MediaImage'
import { PostText } from './PostText'

export function shortDid(did: string): string {
  return `${did.slice(8, 16)}…${did.slice(-4)}`
}

/** Display name, verified handle and avatar for a did. */
export function usePerson(did: string) {
  const manifest = useManifest(did).data
  const handle = useVerifiedHandle(manifest)
  return {
    manifest,
    name: manifest?.profile.displayName ?? shortDid(did),
    handle,
    avatar: manifest?.profile.avatar,
  }
}

export function PostCard({
  entry,
  focused = false,
  threadLine = false,
}: {
  entry: TimelineEntry
  focused?: boolean
  threadLine?: boolean
}) {
  const { post } = entry
  if (isRepost(post) && post.repostOf) return <Repost entry={entry} />
  return <PostBody cid={entry.cid} post={post} focused={focused} threadLine={threadLine} />
}

function Repost({ entry }: { entry: TimelineEntry }) {
  const reposter = usePerson(entry.post.author)
  const original = usePost(entry.post.repostOf?.toString())
  const header = (
    <Link
      to={`/u/${entry.post.author}`}
      className="flex items-center gap-2 pl-10 text-xs font-semibold text-stone-500 hover:underline"
    >
      <Repeat2 className="size-3.5" /> {reposter.name} reposted
    </Link>
  )
  if (!original.data || !entry.post.repostOf) {
    return (
      <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        {header}
        <p className="mt-2 pl-10 text-sm text-stone-500">
          {original.isError ? 'The original post is unavailable.' : 'Loading…'}
        </p>
      </div>
    )
  }
  return <PostBody cid={entry.post.repostOf} post={original.data} header={header} />
}

function PostBody({
  cid,
  post,
  focused = false,
  threadLine = false,
  header,
}: {
  cid: CID
  post: Post
  focused?: boolean
  threadLine?: boolean
  header?: ReactNode
}) {
  const navigate = useNavigate()
  const author = usePerson(post.author)
  const open = () => navigate(`/p/${cid}`)
  const onCardClick = (e: MouseEvent) => {
    // Don't hijack text selection or clicks on links and buttons inside the card.
    if (window.getSelection()?.toString() || (e.target as HTMLElement).closest('a,button')) return
    open()
  }

  return (
    <article
      onClick={focused ? undefined : onCardClick}
      onKeyDown={(e) => e.key === 'Enter' && !focused && e.target === e.currentTarget && open()}
      tabIndex={focused ? undefined : 0}
      className={`border-b border-stone-200 px-4 py-3 outline-none transition-colors dark:border-stone-800 ${focused ? '' : 'cursor-pointer hover:bg-stone-50/80 focus-visible:bg-stone-50 dark:hover:bg-stone-900/50 dark:focus-visible:bg-stone-900/50'}`}
    >
      {header && <div className="mb-1">{header}</div>}
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Link to={`/u/${post.author}`}>
            <Avatar cid={author.avatar} name={author.name} seed={post.author} />
          </Link>
          {threadLine && <div className="mt-1 w-0.5 flex-1 rounded bg-stone-200 dark:bg-stone-800" />}
        </div>
        <div className="min-w-0 flex-1">
          <header className={`flex min-w-0 gap-1 ${focused ? 'flex-col' : 'items-baseline'}`}>
            <span className="flex min-w-0 items-center gap-1">
              <Link to={`/u/${post.author}`} className="truncate font-bold hover:underline">
                {author.name}
              </Link>
              {author.handle && <BadgeCheck className="size-4 shrink-0 text-brand-500" aria-label="Verified handle" />}
            </span>
            <span className="flex min-w-0 items-baseline gap-1 text-sm text-stone-500">
              <span className="truncate">{author.handle ? `@${author.handle}` : shortDid(post.author)}</span>
              {!focused && (
                <>
                  <span>·</span>
                  <time dateTime={post.createdAt} title={fullDate(post.createdAt)} className="shrink-0 hover:underline">
                    {timeAgo(post.createdAt)}
                  </time>
                </>
              )}
            </span>
          </header>
          {post.replyTo && <ReplyingTo cid={post.replyTo} />}
          {post.text && (
            <PostText
              text={post.text}
              mentions={post.mentions}
              className={focused ? 'mt-3 text-xl leading-snug' : 'mt-0.5 text-[15px] leading-normal'}
            />
          )}
          {post.media.length > 0 && <MediaGrid media={post.media} />}
          {post.quoteOf && <QuotedPost cid={post.quoteOf} />}
          {focused && (
            <p className="mt-3 border-b border-stone-200 pb-3 text-sm text-stone-500 dark:border-stone-800">
              {fullDate(post.createdAt)}
            </p>
          )}
          <PostActions cid={cid} post={post} large={focused} />
        </div>
      </div>
    </article>
  )
}

function ReplyingTo({ cid }: { cid: CID }) {
  const parent = usePost(cid.toString()).data
  const person = usePerson(parent?.author ?? '')
  if (!parent) return null
  return (
    <p className="text-sm text-stone-500">
      Replying to{' '}
      <Link to={`/u/${parent.author}`} className="text-brand-600 hover:underline dark:text-brand-400">
        @{person.handle ?? person.name}
      </Link>
    </p>
  )
}

function MediaGrid({ media }: { media: CID[] }) {
  const layouts: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2', 4: 'grid-cols-2' }
  return (
    <div
      className={`mt-2 grid gap-0.5 overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800 ${layouts[media.length]}`}
    >
      {media.map((cid, i) => (
        <MediaImage
          key={cid.toString()}
          cid={cid.toString()}
          className={`w-full ${media.length === 1 ? 'max-h-[32rem]' : 'aspect-square'} ${media.length === 3 && i === 0 ? 'row-span-2 h-full' : ''}`}
        />
      ))}
    </div>
  )
}

export function QuotedPost({ cid }: { cid: CID }) {
  const navigate = useNavigate()
  const quoted = usePost(cid.toString())
  const author = usePerson(quoted.data?.author ?? '')
  if (!quoted.data) {
    return (
      <div className="mt-2 rounded-2xl border border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-800">
        {quoted.isError ? 'Quoted post unavailable.' : 'Loading…'}
      </div>
    )
  }
  const post = quoted.data
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        navigate(`/p/${cid}`)
      }}
      className="mt-2 block w-full rounded-2xl border border-stone-200 p-3 text-left hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"
    >
      <span className="flex items-center gap-2 text-sm">
        <Avatar cid={author.avatar} name={author.name} seed={post.author} size="xs" />
        <span className="font-bold">{author.name}</span>
        <span className="text-stone-500">· {timeAgo(post.createdAt)}</span>
      </span>
      {post.text && <p className="mt-1 line-clamp-4 text-[15px] whitespace-pre-wrap">{post.text}</p>}
      {post.media.length > 0 && (
        <p className="mt-1 text-xs text-stone-500">
          {post.media.length} image{post.media.length > 1 ? 's' : ''}
        </p>
      )}
    </button>
  )
}

function PostActions({ cid, post, large }: { cid: CID; post: Post; large: boolean }) {
  const { network, compose, toast } = useApp()
  const client = useQueryClient()
  const me = useMe().data
  const own = useOwnManifest()
  const paired = me !== undefined
  const serverLiked = own?.likes?.some((c) => c.equals(cid)) ?? false
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null)
  const liked = likedOverride ?? serverLiked
  // biome-ignore lint/correctness/useExhaustiveDependencies: drop the optimistic value once the real one changes
  useEffect(() => setLikedOverride(null), [serverLiked])

  const replyCount = network ? repliesTo(network.posts, cid).length : 0
  const repostCount = network ? repostsOf(network.posts, cid).length : 0
  const likeCount = (network ? likers(network, cid).filter((p) => p.did !== me?.did).length : 0) + (liked ? 1 : 0)

  const refresh = () => client.invalidateQueries({ queryKey: ['me'] })
  const toggleLike = useMutation({
    mutationFn: (next: boolean) => (next ? agent.like(cid.toString()) : agent.unlike(cid.toString())),
    onMutate: (next) => setLikedOverride(next),
    onError: (err) => {
      setLikedOverride(null)
      toast(err.message, 'error')
    },
    onSuccess: refresh,
  })
  const repost = useMutation({
    mutationFn: () => agent.createPost({ text: '', repostOf: cid.toString() }),
    onSuccess: () => {
      toast('Reposted')
      return refresh()
    },
    onError: (err) => toast(err.message, 'error'),
  })

  const needPairing = () => toast('Connect your SocialKey app to do that', 'error')
  const iconSize = large ? 'size-5' : 'size-[18px]'
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div className={`mt-2 flex items-center justify-between text-stone-500 ${large ? 'max-w-full py-1' : 'max-w-md'}`}>
      <ActionButton
        label="Reply"
        count={replyCount}
        hover="hover:text-sky-500 hover:bg-sky-500/10"
        onClick={stop(() => (paired ? compose({ replyTo: cid }) : needPairing()))}
      >
        <MessageCircle className={iconSize} />
      </ActionButton>
      <Menu
        trigger={(toggle) => (
          <ActionButton
            label="Repost"
            count={repostCount}
            hover="hover:text-emerald-500 hover:bg-emerald-500/10"
            onClick={stop(() => (paired ? toggle() : needPairing()))}
          >
            <Repeat2 className={iconSize} />
          </ActionButton>
        )}
        items={[
          { label: 'Repost', icon: <Repeat2 className="size-4" />, onClick: () => repost.mutate() },
          { label: 'Quote', icon: <Quote className="size-4" />, onClick: () => compose({ quoteOf: cid }) },
        ]}
      />
      <ActionButton
        label={liked ? 'Unlike' : 'Like'}
        count={likeCount}
        active={liked}
        hover="hover:text-rose-500 hover:bg-rose-500/10"
        activeClass="text-rose-500"
        onClick={stop(() => (paired ? toggleLike.mutate(!liked) : needPairing()))}
      >
        <Heart className={`${iconSize} ${liked ? 'fill-current' : ''}`} />
      </ActionButton>
      <ActionButton
        label="Copy link"
        hover="hover:text-brand-500 hover:bg-brand-500/10"
        onClick={stop(async () => {
          await navigator.clipboard.writeText(postLink(cid.toString()))
          toast('Link copied')
        })}
      >
        <Share className={iconSize} />
      </ActionButton>
      {post.author === me?.did ? (
        <OwnPostMenu cid={cid} pinned={own?.pinned?.equals(cid) ?? false} />
      ) : paired ? (
        <OtherPostMenu author={post.author} />
      ) : (
        <span className="w-8" />
      )}
    </div>
  )
}

/** Mute or block an author from any of their posts. */
function OtherPostMenu({ author }: { author: string }) {
  const person = usePerson(author)
  const moderate = useModerate()
  return (
    <Menu
      trigger={(toggle) => (
        <button
          type="button"
          aria-label="More"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          className="rounded-full p-2 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white"
        >
          <Ellipsis className="size-[18px]" />
        </button>
      )}
      items={[
        {
          label: `Mute ${person.name}`,
          icon: <VolumeX className="size-4" />,
          onClick: () => moderate('muted', author, true, person.name),
        },
        {
          label: `Block ${person.name}`,
          icon: <Ban className="size-4" />,
          danger: true,
          onClick: () => moderate('blocked', author, true, person.name),
        },
      ]}
    />
  )
}

/** Adds or removes someone from your private mute or block list. */
export function useModerate() {
  const { toast } = useApp()
  const client = useQueryClient()
  return async (list: 'muted' | 'blocked', did: string, on: boolean, name: string) => {
    if (
      list === 'blocked' &&
      on &&
      !confirm(`Block ${name}? You'll stop following them and won't see their posts or messages. They won't be told.`)
    )
      return
    try {
      client.setQueryData(['moderation'], await agent.setModeration(list, did, on))
      if (list === 'blocked') await client.invalidateQueries({ queryKey: ['me'] })
      toast(`${on ? (list === 'muted' ? 'Muted' : 'Blocked') : list === 'muted' ? 'Unmuted' : 'Unblocked'} ${name}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }
}

function OwnPostMenu({ cid, pinned }: { cid: CID; pinned: boolean }) {
  const { toast } = useApp()
  const client = useQueryClient()
  const navigate = useNavigate()
  const act = useMutation({
    mutationFn: (action: 'pin' | 'unpin' | 'delete') =>
      action === 'delete' ? agent.deletePost(cid.toString()) : agent.pin(action === 'pin' ? cid.toString() : null),
    onSuccess: async (_, action) => {
      toast(action === 'delete' ? 'Post deleted' : action === 'pin' ? 'Pinned to your profile' : 'Unpinned')
      await client.invalidateQueries({ queryKey: ['me'] })
      if (action === 'delete' && location.hash.includes(`/p/${cid}`)) navigate('/')
    },
    onError: (err) => toast(err.message, 'error'),
  })
  return (
    <Menu
      trigger={(toggle) => (
        <button
          type="button"
          aria-label="More"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          className="rounded-full p-2 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white"
        >
          <Ellipsis className="size-[18px]" />
        </button>
      )}
      items={[
        pinned
          ? { label: 'Unpin from profile', icon: <PinOff className="size-4" />, onClick: () => act.mutate('unpin') }
          : { label: 'Pin to profile', icon: <Pin className="size-4" />, onClick: () => act.mutate('pin') },
        {
          label: 'Copy post ID',
          icon: <LinkIcon className="size-4" />,
          onClick: async () => {
            await navigator.clipboard.writeText(cid.toString())
            toast('Post ID copied')
          },
        },
        {
          label: 'Delete post',
          icon: <Trash className="size-4" />,
          danger: true,
          onClick: () => {
            if (
              confirm('Delete this post? It disappears from your profile. People who already saw it may keep a copy.')
            )
              act.mutate('delete')
          },
        },
      ]}
    />
  )
}

function ActionButton({
  label,
  count,
  active = false,
  hover,
  activeClass = '',
  onClick,
  children,
}: {
  label: string
  count?: number
  active?: boolean
  hover: string
  activeClass?: string
  onClick: (e: MouseEvent) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`group flex items-center gap-1 text-sm ${active ? activeClass : ''}`}
    >
      <span className={`rounded-full p-2 transition-colors ${hover}`}>{children}</span>
      {count !== undefined && <span className="min-w-4 tabular-nums">{count > 0 ? count : ''}</span>}
    </button>
  )
}

interface MenuItem {
  label: string
  icon: ReactNode
  danger?: boolean
  onClick: () => void
}

export function Menu({ trigger, items }: { trigger: (toggle: () => void) => ReactNode; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 min-w-48 animate-fade-in overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-xl dark:border-stone-700 dark:bg-stone-900"
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                item.onClick()
              }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 ${item.danger ? 'text-red-600' : ''}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
