import { Hash, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { useApp } from '../components/AppContext'
import { SearchBox } from '../components/Layout'
import { PostList } from '../components/PostList'
import { EmptyState, PageHeader, Spinner } from '../components/ui'
import { WhoToFollow } from '../components/WhoToFollow'
import { useExtendedNetwork, useMe } from '../lib/queries'
import { trendingTags } from '../lib/social'

export function Explore() {
  const me = useMe().data
  const { network } = useApp()
  const extended = useExtendedNetwork()
  const tags = network ? trendingTags(network.posts).slice(0, 8) : []
  // Recent posts from friends of friends: people you don't follow yet.
  const discover = network?.posts.filter((e) => network.people.get(e.post.author)?.depth === 2).slice(0, 20) ?? []

  return (
    <>
      <PageHeader title="Explore" subtitle={me ? 'From people within two follows of you' : undefined} />
      <div className="border-b border-stone-200 p-4 dark:border-stone-800">
        <SearchBox />
      </div>
      {!me ? (
        <EmptyState icon={<Sparkles className="size-7" />} title="Discover people">
          SocialKey has no central directory: discovery happens through the people you follow.{' '}
          <Link to="/connect" className="text-brand-600 hover:underline">
            Connect your app
          </Link>{' '}
          to see who your friends follow, or look someone up by their ID or handle above.
        </EmptyState>
      ) : (
        <>
          {tags.length > 0 && (
            <section className="border-b border-stone-200 dark:border-stone-800">
              <h2 className="px-4 pt-3 text-lg font-bold">Trending in your network</h2>
              <ul>
                {tags.map((t) => (
                  <li key={t.tag}>
                    <Link
                      to={`/tag/${t.tag}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-900/50"
                    >
                      <Hash className="size-4 text-stone-400" />
                      <span className="flex-1 font-bold">#{t.tag}</span>
                      <span className="text-sm text-stone-500">
                        {t.posts} post{t.posts === 1 ? '' : 's'} · {t.people} {t.people === 1 ? 'person' : 'people'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="p-4">
            <WhoToFollow />
          </div>
          {extended.isPending ? (
            <Spinner label="Exploring friends of friends…" />
          ) : (
            <>
              <h2 className="border-t border-stone-200 px-4 pt-4 pb-2 text-lg font-bold dark:border-stone-800">
                Posts you might like
              </h2>
              <PostList entries={discover} empty="Follow a few people and their friends' posts will show up here." />
            </>
          )}
        </>
      )}
    </>
  )
}
