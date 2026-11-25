import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { agent } from '../lib/agent'
import { useMe, useOwnManifest } from '../lib/queries'
import { useApp } from './AppContext'
import { Avatar } from './Avatar'
import { shortDid, usePerson } from './PostCard'
import { Button } from './ui'

export function FollowButton({
  did,
  size = 'sm',
  compact = false,
}: {
  did: string
  size?: 'sm' | 'md'
  compact?: boolean
}) {
  const { toast } = useApp()
  const client = useQueryClient()
  const me = useMe().data
  const own = useOwnManifest()
  const [hover, setHover] = useState(false)
  const toggle = useMutation({
    mutationFn: (following: boolean) => (following ? agent.unfollow(did) : agent.follow(did)),
    onSuccess: (_, following) => {
      toast(following ? 'Unfollowed' : 'Following')
      return client.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => toast(err.message, 'error'),
  })
  if (!me || !own || me.did === did) return null
  const following = own.follows.includes(did)
  return (
    <Button
      size={size}
      variant={following ? 'secondary' : 'primary'}
      busy={toggle.isPending}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation()
        toggle.mutate(following)
      }}
      className={`${compact ? 'shrink-0' : 'min-w-24'} ${following && hover ? 'border-red-300 text-red-600 dark:border-red-800' : ''}`}
    >
      {following ? (hover ? 'Unfollow' : 'Following') : 'Follow'}
    </Button>
  )
}

export function UserRow({
  did,
  note,
  showBio = true,
  compact = false,
}: {
  did: string
  note?: string
  showBio?: boolean
  compact?: boolean
}) {
  const person = usePerson(did)
  return (
    <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-900/50">
      <Link to={`/u/${did}`}>
        <Avatar cid={person.avatar} name={person.name} seed={did} size={compact ? 'sm' : 'md'} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/u/${did}`} className="block">
          <span className="flex items-center gap-1 font-bold hover:underline">
            <span className="truncate">{person.name}</span>
            {person.handle && <BadgeCheck className="size-4 shrink-0 text-brand-500" />}
          </span>
          <span className="block truncate text-sm text-stone-500">
            {person.handle ? `@${person.handle}` : shortDid(did)}
          </span>
        </Link>
        {note && (
          <p className={`mt-0.5 text-xs text-stone-500 ${compact ? 'truncate' : ''}`} title={note}>
            {note}
          </p>
        )}
        {showBio && person.manifest?.profile.bio && (
          <p className="mt-1 line-clamp-2 text-sm">{person.manifest.profile.bio}</p>
        )}
      </div>
      <FollowButton did={did} compact={compact} />
    </div>
  )
}
