import { mergeTimeline } from '@socialkey/core'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Users } from 'lucide-react'
import { Link } from 'react-router'
import { Composer } from '../components/Composer'
import { PostList } from '../components/PostList'
import { EmptyState, PageHeader, PostSkeleton } from '../components/ui'
import { WhoToFollow } from '../components/WhoToFollow'
import { useCircle, useMe, useModeration, useOwnManifest, useOwnPosts } from '../lib/queries'
import { Landing } from './Landing'

export function Home() {
  const me = useMe()
  if (!me.data) return me.isLoading ? <PostSkeletons /> : <Landing />
  return <Timeline />
}

function Timeline() {
  const client = useQueryClient()
  const own = useOwnManifest()
  const circle = useCircle()
  const ownPosts = useOwnPosts()
  const { hidden } = useModeration()
  const entries = mergeTimeline([ownPosts.data ?? [], (circle.data?.posts ?? []).filter((e) => !hidden(e.post.author))])
  const loading = !own || circle.isPending

  return (
    <>
      <PageHeader title="Home">
        <button
          type="button"
          aria-label="Refresh"
          title="Refresh"
          onClick={() => client.invalidateQueries({ queryKey: ['network'] })}
          className="rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <RefreshCw className={`size-5 ${circle.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </PageHeader>
      <div className="hidden border-b border-stone-200 px-4 py-3 sm:block dark:border-stone-800">
        <Composer />
      </div>
      {loading ? (
        <PostSkeletons />
      ) : (
        <PostList
          entries={entries}
          empty={
            <>
              <EmptyState icon={<Users className="size-7" />} title="Welcome to SocialKey!">
                Your timeline shows posts from people you follow. Write your first post, or{' '}
                <Link to="/explore" className="text-brand-600 hover:underline">
                  find people to follow
                </Link>
                .
              </EmptyState>
              <div className="px-4">
                <WhoToFollow />
              </div>
            </>
          }
        />
      )}
    </>
  )
}

function PostSkeletons() {
  // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
  return Array.from({ length: 5 }, (_, i) => <PostSkeleton key={i} />)
}
