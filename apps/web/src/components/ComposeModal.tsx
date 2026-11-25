import { X } from 'lucide-react'
import { useEffect } from 'react'
import { usePost } from '../lib/queries'
import type { ComposeTarget } from './AppContext'
import { Composer } from './Composer'
import { PostCard } from './PostCard'

export function ComposeModal({ target, onClose }: { target: ComposeTarget; onClose: () => void }) {
  const parent = usePost(target.replyTo?.toString()).data
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking the backdrop closes the dialog; Escape does too
    <div
      role="presentation"
      className="fixed inset-0 z-40 flex animate-fade-in items-start justify-center bg-black/40 p-0 backdrop-blur-sm sm:p-4 sm:pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compose"
        className="flex max-h-full w-full max-w-xl animate-slide-up flex-col overflow-y-auto bg-white shadow-2xl sm:rounded-2xl dark:bg-stone-950 dark:ring-1 dark:ring-stone-800"
      >
        <div className="flex items-center px-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        {target.replyTo && parent && (
          <div className="pointer-events-none [&_article]:border-0">
            <PostCard entry={{ cid: target.replyTo, post: parent }} threadLine />
          </div>
        )}
        <div className="px-4 pb-4">
          <Composer replyTo={target.replyTo} quoteOf={target.quoteOf} autoFocus onDone={onClose} />
        </div>
      </div>
    </div>
  )
}
