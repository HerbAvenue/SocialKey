import { Link } from 'react-router'
import { useOwnManifest } from '../lib/queries'
import { suggestPeople } from '../lib/social'
import { useApp } from './AppContext'
import { UserRow } from './People'

export function WhoToFollow({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const { network } = useApp()
  const own = useOwnManifest()
  if (!network || !own) return null
  const suggestions = suggestPeople(network, own).slice(0, limit)
  if (suggestions.length === 0) return null
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
      <h2 className="px-4 pt-3 pb-1 text-lg font-bold">Who to follow</h2>
      {suggestions.map(({ person, mutuals }) => (
        <UserRow
          key={person.did}
          did={person.did}
          showBio={!compact}
          compact={compact}
          note={mutualNote(mutuals.map((m) => m.manifest.profile.displayName))}
        />
      ))}
      {limit && (
        <Link
          to="/explore"
          className="block px-4 py-3 text-sm text-brand-600 hover:bg-stone-50 dark:text-brand-400 dark:hover:bg-stone-900"
        >
          Show more
        </Link>
      )}
    </section>
  )
}

export function mutualNote(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `Followed by ${names[0]}`
  if (names.length === 2) return `Followed by ${names[0]} and ${names[1]}`
  return `Followed by ${names[0]}, ${names[1]} and ${names.length - 2} more you follow`
}
