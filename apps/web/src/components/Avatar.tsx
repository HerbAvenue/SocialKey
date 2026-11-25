import type { CID } from '@socialkey/core'
import { useMediaUrl } from '../lib/queries'

export function Avatar({ cid, name, size = 'md' }: { cid?: CID; name: string; size?: 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'size-20 text-2xl' : 'size-10 text-base'
  return (
    <div
      className={`${dims} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-300 font-semibold dark:bg-stone-700`}
    >
      {cid ? <AvatarImage cid={cid.toString()} /> : name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function AvatarImage({ cid }: { cid: string }) {
  const url = useMediaUrl(cid)
  return url ? <img src={url} alt="" className="size-full object-cover" /> : null
}
