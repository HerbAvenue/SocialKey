import { segmentText } from '@socialkey/core'
import { Link } from 'react-router'
import { useApp } from './AppContext'

/** Post text with links, #hashtags and @mentions made clickable. */
export function PostText({
  text,
  mentions = [],
  className = '',
}: {
  text: string
  mentions?: string[]
  className?: string
}) {
  const { network } = useApp()
  const mentionedPeople = mentions.map((did) => ({ did, profile: network?.people.get(did)?.manifest.profile }))

  const resolveMention = (name: string): string | undefined => {
    const lower = name.toLowerCase()
    return (
      mentionedPeople.find(
        ({ profile }) =>
          profile &&
          (profile.handle?.toLowerCase() === lower || profile.displayName.replace(/\s+/g, '').toLowerCase() === lower),
      )?.did ?? (mentions.length === 1 ? mentions[0] : undefined)
    )
  }

  const stop = (e: { stopPropagation(): void }) => e.stopPropagation()
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {segmentText(text).map((segment, i) => {
        const key = `${i}-${segment.text}`
        if (segment.kind === 'url') {
          return (
            <a
              key={key}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={stop}
              className="text-brand-600 hover:underline dark:text-brand-400"
            >
              {segment.text.replace(/^https?:\/\//, '').slice(0, 40)}
              {segment.text.replace(/^https?:\/\//, '').length > 40 ? '…' : ''}
            </a>
          )
        }
        if (segment.kind === 'hashtag') {
          return (
            <Link
              key={key}
              to={`/tag/${segment.tag}`}
              onClick={stop}
              className="text-brand-600 hover:underline dark:text-brand-400"
            >
              {segment.text}
            </Link>
          )
        }
        if (segment.kind === 'mention') {
          const did = resolveMention(segment.name)
          return did ? (
            <Link
              key={key}
              to={`/u/${did}`}
              onClick={stop}
              className="text-brand-600 hover:underline dark:text-brand-400"
            >
              {segment.text}
            </Link>
          ) : (
            <span key={key}>{segment.text}</span>
          )
        }
        return <span key={key}>{segment.text}</span>
      })}
    </p>
  )
}
