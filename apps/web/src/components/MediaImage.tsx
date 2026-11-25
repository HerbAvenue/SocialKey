import { useMediaUrl } from '../lib/queries'

export function MediaImage({ cid, className = '' }: { cid: string; className?: string }) {
  const url = useMediaUrl(cid)
  if (!url) return <div className={`animate-pulse bg-stone-200 dark:bg-stone-800 ${className}`} />
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block">
      <img src={url} alt="" loading="lazy" className={`object-cover ${className}`} />
    </a>
  )
}
