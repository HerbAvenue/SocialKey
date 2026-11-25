import type { CID } from 'multiformats/cid'
import type { Post } from './schemas'

export interface TimelineEntry {
  cid: CID
  post: Post
}

/** Merges per-author post lists newest first, dropping duplicate CIDs. */
export function mergeTimeline(lists: TimelineEntry[][]): TimelineEntry[] {
  const seen = new Set<string>()
  const merged: TimelineEntry[] = []
  for (const entry of lists.flat()) {
    const key = entry.cid.toString()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(entry)
  }
  return merged.sort((a, b) => b.post.createdAt.localeCompare(a.post.createdAt))
}
