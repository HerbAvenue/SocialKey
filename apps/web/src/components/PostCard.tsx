import type { CID, Post } from '@socialkey/core'
import { Link } from 'react-router'
import { useManifest, useMediaUrl } from '../lib/queries'
import { Avatar } from './Avatar'

export function PostCard({ post }: { cid: CID; post: Post }) {
  const author = useManifest(post.author).data
  const name = author?.profile.displayName ?? shortDid(post.author)
  return (
    <article className="flex gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
      <Link to={`/u/${post.author}`}>
        <Avatar cid={author?.profile.avatar} name={name} />
      </Link>
      <div className="min-w-0 flex-1">
        <header className="flex items-baseline gap-2 text-sm">
          <Link to={`/u/${post.author}`} className="truncate font-semibold hover:underline">
            {name}
          </Link>
          <time className="shrink-0 text-stone-500" dateTime={post.createdAt}>
            {new Date(post.createdAt).toLocaleString()}
          </time>
        </header>
        <p className="mt-1 whitespace-pre-wrap break-words">{post.text}</p>
        {post.media.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {post.media.map((cid) => (
              <MediaImage key={cid.toString()} cid={cid.toString()} />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function MediaImage({ cid }: { cid: string }) {
  const url = useMediaUrl(cid)
  if (!url) return <div className="aspect-video animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
  return <img src={url} alt="" className="max-h-96 w-full rounded-lg object-cover" />
}

export function shortDid(did: string): string {
  return `${did.slice(0, 14)}…${did.slice(-6)}`
}
