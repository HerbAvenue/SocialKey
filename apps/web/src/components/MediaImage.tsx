import { ImageOff } from 'lucide-react'
import { useMediaUrl } from '../lib/queries'

export function MediaImage({ cid, className = '' }: { cid: string; className?: string }) {
  const { url, onError } = useMediaUrl(cid)
  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-stone-100 text-stone-400 dark:bg-stone-900 ${className}`}
        title="Image unavailable right now"
      >
        <ImageOff className="size-6" />
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block">
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={onError}
        className={`bg-stone-100 object-cover dark:bg-stone-900 ${className}`}
      />
    </a>
  )
}
