import type { CID } from '@socialkey/core'
import { useMediaUrl } from '../lib/queries'

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-9 text-sm',
  md: 'size-11 text-base',
  lg: 'size-16 text-xl',
  xl: 'size-28 text-4xl',
}

// A stable colour per person, so placeholder avatars are easy to tell apart.
const COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-sky-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
]

function colorFor(seed: string): string {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return COLORS[Math.abs(hash) % COLORS.length] ?? 'bg-stone-500'
}

export function Avatar({
  cid,
  name,
  seed,
  size = 'md',
  className = '',
}: {
  cid?: CID
  name: string
  seed?: string
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <div
      className={`${SIZES[size]} ${cid ? 'bg-stone-200 dark:bg-stone-800' : colorFor(seed ?? name)} flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${className}`}
    >
      {cid ? <AvatarImage cid={cid.toString()} /> : (name.trim()[0] ?? '?').toUpperCase()}
    </div>
  )
}

function AvatarImage({ cid }: { cid: string }) {
  const { url, onError } = useMediaUrl(cid)
  return url ? <img src={url} alt="" onError={onError} className="size-full object-cover" /> : null
}
