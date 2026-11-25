import type { TimelineEntry } from '@socialkey/core'
import type { ReactNode } from 'react'
import { PostCard } from './PostCard'
import { EmptyState } from './ui'

export function PostList({ entries, empty }: { entries: TimelineEntry[]; empty: ReactNode }) {
  if (entries.length === 0) return typeof empty === 'string' ? <EmptyState title={empty} /> : empty
  return entries.map((entry) => <PostCard key={entry.cid.toString()} entry={entry} />)
}
