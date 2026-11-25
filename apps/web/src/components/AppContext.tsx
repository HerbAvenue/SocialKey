import type { CID } from '@socialkey/core'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { useKnownNetwork, useModeration } from '../lib/queries'
import type { Network } from '../lib/social'
import { ComposeModal } from './ComposeModal'
import { Onboarding } from './Onboarding'

export interface ComposeTarget {
  replyTo?: CID
  quoteOf?: CID
}

interface AppContextValue {
  network: Network | undefined
  toast: (message: string, kind?: 'ok' | 'error') => void
  compose: (target?: ComposeTarget) => void
}

const Context = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(Context)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}

export function AppProvider({ children }: { children: ReactNode }) {
  const known = useKnownNetwork()
  const { hidden } = useModeration()
  // Muted and blocked people's posts disappear everywhere that reads the shared network.
  const network = useMemo(
    () => known && { ...known, posts: known.posts.filter((e) => !hidden(e.post.author)) },
    [known, hidden],
  )
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: 'ok' | 'error' }[]>([])
  const [composing, setComposing] = useState<ComposeTarget | null>(null)

  const toast = useCallback((message: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  const compose = useCallback((target: ComposeTarget = {}) => setComposing(target), [])
  const value = useMemo(() => ({ network, toast, compose }), [network, toast, compose])

  return (
    <Context.Provider value={value}>
      {children}
      {composing && <ComposeModal target={composing} onClose={() => setComposing(null)} />}
      <Onboarding />
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="flex animate-slide-up items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-stone-900"
          >
            {t.kind === 'ok' ? (
              <CircleCheck className="size-4 text-green-400 dark:text-green-600" />
            ) : (
              <CircleAlert className="size-4 text-red-400 dark:text-red-600" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </Context.Provider>
  )
}
