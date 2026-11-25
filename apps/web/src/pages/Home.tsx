import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Composer } from '../components/Composer'
import { PostList } from '../components/PostList'
import { useManifest, useMe, useTimeline } from '../lib/queries'

export function Home() {
  const me = useMe()
  const own = useManifest(me.data?.did)
  const timeline = useTimeline(me.data, own.data)

  if (!me.data) return <Welcome />
  return (
    <>
      <Composer />
      <div className="border-b border-stone-200 p-4 dark:border-stone-800">
        <FindProfile />
      </div>
      {timeline.isPending ? (
        <p className="p-8 text-center text-stone-500">Loading timeline…</p>
      ) : (
        <PostList entries={timeline.data ?? []} empty="No posts yet. Write one, or follow someone." />
      )}
    </>
  )
}

function Welcome() {
  return (
    <div className="space-y-6 p-6">
      <p>
        SocialKey profiles live on IPFS, hosted by their owners. Browse anyone's profile by their did:key, or{' '}
        <Link to="/connect" className="font-semibold underline">
          connect your local agent
        </Link>{' '}
        to post and see your timeline.
      </p>
      <FindProfile />
    </div>
  )
}

/** Opens a profile by its ID, which is where you follow someone. */
function FindProfile() {
  const navigate = useNavigate()
  const [did, setDid] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (did.trim()) navigate(`/u/${did.trim()}`)
      }}
      className="flex gap-2"
    >
      <input
        value={did}
        onChange={(e) => setDid(e.target.value)}
        placeholder="Paste someone's ID (did:key:z6Mk…) to view or follow them"
        className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-transparent px-3 py-2 dark:border-stone-700"
      />
      <button type="submit" className="rounded-lg border border-stone-300 px-4 dark:border-stone-700">
        View
      </button>
    </form>
  )
}
