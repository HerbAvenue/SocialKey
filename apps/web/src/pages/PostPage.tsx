import type { CID, Post, TimelineEntry } from '@socialkey/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquareOff } from 'lucide-react'
import { useParams } from 'react-router'
import { useApp } from '../components/AppContext'
import { Composer } from '../components/Composer'
import { PostCard } from '../components/PostCard'
import { EmptyState, PageHeader, PostSkeleton } from '../components/ui'
import { parseCid, postQuery, useMe, usePost } from '../lib/queries'
import { repliesTo } from '../lib/social'

const MAX_ANCESTORS = 10

/** A post with the conversation above it and the replies your network has made. */
export function PostPage() {
  const { cid: param } = useParams()
  const cid = parseCid(param)
  const post = usePost(cid?.toString())
  if (!cid) return <EmptyState title="That isn't a post link" />
  return (
    <>
      <PageHeader title="Post" back />
      {post.isPending ? (
        <PostSkeleton />
      ) : post.error || !post.data ? (
        <EmptyState icon={<MessageSquareOff className="size-7" />} title="This post is unavailable">
          It may have been deleted, or its author's computer is offline.
        </EmptyState>
      ) : (
        <Thread key={cid.toString()} cid={cid} post={post.data} />
      )}
    </>
  )
}

function Thread({ cid, post }: { cid: CID; post: Post }) {
  const client = useQueryClient()
  const { network } = useApp()
  const me = useMe().data
  const ancestors = useQuery({
    queryKey: ['ancestors', cid.toString()],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const chain: TimelineEntry[] = []
      let parent = post.replyTo
      while (parent && chain.length < MAX_ANCESTORS) {
        const parentPost = await client.fetchQuery(postQuery(parent.toString())).catch(() => undefined)
        if (!parentPost) break
        chain.unshift({ cid: parent, post: parentPost })
        parent = parentPost.replyTo
      }
      return chain
    },
  })
  const replies = network ? repliesTo(network.posts, cid) : []

  return (
    <>
      {ancestors.data?.map((entry) => (
        <div key={entry.cid.toString()} className="[&_article]:border-b-0">
          <PostCard entry={entry} threadLine />
        </div>
      ))}
      <PostCard entry={{ cid, post }} focused />
      {me && (
        <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
          <Composer replyTo={cid} placeholder="Post your reply" />
        </div>
      )}
      {replies.map((entry) => (
        <PostCard key={entry.cid.toString()} entry={entry} />
      ))}
      {replies.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-stone-500">No replies from your network yet.</p>
      )}
    </>
  )
}
