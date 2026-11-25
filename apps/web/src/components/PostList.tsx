import type { TimelineEntry } from '@socialkey/core'
import { PostCard } from './PostCard'

export function PostList({ entries, empty }: { entries: TimelineEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="p-8 text-center text-stone-500">{empty}</p>
  return entries.map(({ cid, post }) => <PostCard key={cid.toString()} cid={cid} post={post} />)
}
