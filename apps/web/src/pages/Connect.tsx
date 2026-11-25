import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, MonitorSmartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useApp } from '../components/AppContext'
import { Button, Card, inputClass, PageHeader, Spinner } from '../components/ui'
import { agent } from '../lib/agent'
import { AGENT_URL } from '../lib/config'
import { useMe } from '../lib/queries'

export function Connect() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useApp()
  const me = useMe()
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') ?? '')
  const pair = useMutation({
    mutationFn: (pairingCode: string) => agent.pair(pairingCode),
    onSuccess: async () => {
      await client.resetQueries({ queryKey: ['me'] })
      toast('Connected')
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

  if (pair.isPending || (linkCode && !pair.error)) return <Spinner label="Connecting to your SocialKey app…" />

  return (
    <>
      <PageHeader title="Connect your app" />
      <div className="space-y-4 p-4">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="rounded-2xl bg-brand-50 p-4 text-brand-600 dark:bg-brand-600/15 dark:text-brand-400">
            <KeyRound className="size-8" />
          </div>
          <h2 className="text-2xl font-extrabold">{me.data ? "You're connected" : 'Post from this browser'}</h2>
          <p className="max-w-md text-stone-500">
            {me.data ? (
              <>
                This browser posts through your SocialKey app at <code>{AGENT_URL}</code>.
              </>
            ) : (
              'Your SocialKey desktop app holds your key. Connect it to this browser to post, follow and like.'
            )}
          </p>
        </div>
        {!me.data && (
          <>
            <Card>
              <h3 className="flex items-center gap-2 font-bold">
                <MonitorSmartphone className="size-5" /> The easy way
              </h3>
              <p className="mt-1 text-sm text-stone-500">
                Click <b>Open SocialKey</b> in the desktop app. It opens this site already connected.
              </p>
            </Card>
            <Card>
              <h3 className="font-bold">Or enter a pairing code</h3>
              <p className="mt-1 text-sm text-stone-500">
                Find it in the desktop app under <i>Using a different SocialKey website?</i>
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  pair.mutate(code)
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ABCD1234EF"
                  autoComplete="off"
                  className={`${inputClass} font-mono tracking-widest uppercase`}
                />
                <Button type="submit" disabled={!code.trim()}>
                  Connect
                </Button>
              </form>
              {pair.error && (
                <p className="mt-2 text-sm text-red-600">
                  {pair.error.message === 'Failed to fetch'
                    ? `Can't reach the SocialKey app at ${AGENT_URL}. Is it running?`
                    : pair.error.message}
                </p>
              )}
            </Card>
            <p className="text-center text-sm text-stone-500">
              Don't have the app?{' '}
              <Link to="/get" className="text-brand-600 hover:underline">
                Get SocialKey
              </Link>
            </p>
          </>
        )}
      </div>
    </>
  )
}
