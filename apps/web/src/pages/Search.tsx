import { didKey, ipnsNameToDid, normalizeHandle } from '@socialkey/core'
import { SearchX } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router'
import { useApp } from '../components/AppContext'
import { SearchBox } from '../components/Layout'
import { UserRow } from '../components/People'
import { PostList } from '../components/PostList'
import { EmptyState, PageHeader, Spinner } from '../components/ui'
import { useHandle } from '../lib/queries'
import { search } from '../lib/social'

/** IDs, IPNS names and handles jump straight to a profile; anything else searches what's loaded. */
export function Search() {
  const [params] = useSearchParams()
  const q = params.get('q')?.trim() ?? ''
  const direct = directProfile(q)
  const handle = !direct && q.includes('.') ? normalizeHandle(q) : null
  const resolved = useHandle(handle ?? undefined)

  if (direct) return <Navigate to={`/u/${direct}`} replace />
  if (handle && resolved.data) return <Navigate to={`/u/${resolved.data}`} replace />
  return (
    <>
      <PageHeader title="Search" back />
      <div className="border-b border-stone-200 p-4 dark:border-stone-800">
        <SearchBox key={q} initial={q} />
      </div>
      {handle && resolved.isPending ? (
        <Spinner label={`Looking up @${handle}…`} />
      ) : (
        <Results q={q} handleTried={handle} />
      )}
    </>
  )
}

function Results({ q, handleTried }: { q: string; handleTried: string | null }) {
  const { network } = useApp()
  const results = network ? search(network, q) : { people: [], posts: [] }
  if (!q) return null
  return (
    <>
      {handleTried && (
        <p className="border-b border-stone-200 px-4 py-3 text-sm text-stone-500 dark:border-stone-800">
          No SocialKey profile is linked to @{handleTried}.
        </p>
      )}
      {results.people.length === 0 && results.posts.length === 0 ? (
        <EmptyState icon={<SearchX className="size-7" />} title={`No results for “${q}”`}>
          Search covers the people and posts in your network. To find someone new, paste their SocialKey ID or handle.
        </EmptyState>
      ) : (
        <>
          {results.people.length > 0 && (
            <section className="border-b border-stone-200 dark:border-stone-800">
              <h2 className="px-4 pt-3 text-lg font-bold">People</h2>
              {results.people.slice(0, 10).map((p) => (
                <UserRow key={p.did} did={p.did} />
              ))}
            </section>
          )}
          {results.posts.length > 0 && (
            <>
              <h2 className="px-4 pt-3 text-lg font-bold">Posts</h2>
              <PostList entries={results.posts} empty="" />
            </>
          )}
        </>
      )}
    </>
  )
}

function directProfile(q: string): string | null {
  const value = q.replace(/^.*#\/u\//, '').replace(/^@/, '')
  if (didKey.safeParse(value).success) return value
  try {
    return value.startsWith('k51') ? ipnsNameToDid(value) : null
  } catch {
    return null
  }
}
