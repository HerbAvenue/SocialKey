import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { agent } from '../lib/agent'
import { AGENT_URL } from '../lib/config'
import { useMe } from '../lib/queries'

export function Connect() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const me = useMe()
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') ?? '')
  const pair = useMutation({
    mutationFn: (pairingCode: string) => agent.pair(pairingCode),
    onSuccess: async () => {
      await client.resetQueries({ queryKey: ['me'] })
      navigate('/')
    },
  })

  // The desktop app opens #/connect?code=... so pairing needs no typing.
  const autoPaired = useRef(false)
  const linkCode = params.get('code')
  const { mutate } = pair
  const checkingToken = me.isPending && me.fetchStatus !== 'idle'
  useEffect(() => {
    if (!linkCode || autoPaired.current || checkingToken) return
    autoPaired.current = true
    // Already paired in this browser: no need to spend the code.
    if (me.data) navigate('/')
    else mutate(linkCode)
  }, [linkCode, checkingToken, me.data, mutate, navigate])

  if (pair.isPending) return <p className="p-8 text-center text-stone-500">Connecting to your agent…</p>
  if (me.data) {
    return (
      <div className="space-y-4 p-6">
        <p>
          Connected to the agent at <code>{AGENT_URL}</code> as <code className="break-all">{me.data.did}</code>.
        </p>
        <button
          type="button"
          onClick={() => {
            agent.unpair()
            client.resetQueries({ queryKey: ['me'] })
          }}
          className="rounded-lg border border-stone-300 px-4 py-2 dark:border-stone-700"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        pair.mutate(code)
      }}
      className="space-y-4 p-6"
    >
      <p>
        Open the SocialKey desktop app and click <strong>Open SocialKey</strong>, or enter the pairing code shown under{' '}
        <em>Using a different website?</em>
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Pairing code"
        autoComplete="off"
        className="w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 font-mono tracking-widest uppercase dark:border-stone-700"
      />
      <button
        type="submit"
        disabled={pair.isPending || !code.trim()}
        className="rounded-lg bg-stone-900 px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
      >
        Connect
      </button>
      {pair.error && <p className="text-sm text-red-600">{pair.error.message}</p>}
    </form>
  )
}
