import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Lock, MailPlus, MessagesSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useApp } from '../components/AppContext'
import { Avatar } from '../components/Avatar'
import { shortDid, usePerson } from '../components/PostCard'
import { Button, EmptyState, inputClass, PageHeader, Spinner } from '../components/ui'
import { agent } from '../lib/agent'
import {
  type ChatMessage,
  markRead,
  readMarks,
  rememberContact,
  unreadConversations,
  useConversations,
} from '../lib/messages'
import { useMe, useModeration, useOwnManifest } from '../lib/queries'
import { fullDate, timeAgo } from '../lib/time'

export function useUnreadMessages(): number {
  const { network } = useApp()
  const chats = useConversations(network).data
  const [marks, setMarks] = useState(readMarks)
  useEffect(() => {
    const update = () => setMarks(readMarks())
    window.addEventListener('socialkey:dm-read', update)
    return () => window.removeEventListener('socialkey:dm-read', update)
  }, [])
  return unreadConversations(chats, marks)
}

export function Messages() {
  const { network } = useApp()
  const me = useMe().data
  const chats = useConversations(network)
  const [composing, setComposing] = useState(false)
  const marks = readMarks()
  const { blocked } = useModeration()
  const list = [...(chats.data ?? new Map<string, ChatMessage[]>())]
    .filter(([did]) => !blocked.has(did))
    .sort((a, b) => (b[1].at(-1)?.createdAt ?? '').localeCompare(a[1].at(-1)?.createdAt ?? ''))

  if (!me) return null
  return (
    <>
      <PageHeader title="Messages" subtitle="End-to-end encrypted">
        <button
          type="button"
          onClick={() => setComposing((c) => !c)}
          aria-label="New message"
          title="New message"
          className="rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <MailPlus className="size-5" />
        </button>
      </PageHeader>
      {composing && <NewConversation />}
      {chats.isPending ? (
        <Spinner label="Decrypting your messages…" />
      ) : chats.error && !chats.data ? (
        <EmptyState title="Couldn't load your messages">{chats.error.message}</EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="size-7" />} title="No messages yet">
          Messages are encrypted so only you and the other person can read them, and they're stored on your own
          computers, not a server.
          <span className="mt-4 block">
            <Button onClick={() => setComposing(true)}>Start a conversation</Button>
          </span>
        </EmptyState>
      ) : (
        list.map(([did, messages]) => {
          const last = messages.at(-1)
          const unread = messages.some((m) => !m.mine && m.createdAt > (marks[did] ?? ''))
          return last ? <ConversationRow key={did} did={did} last={last} unread={unread} /> : null
        })
      )}
    </>
  )
}

function ConversationRow({ did, last, unread }: { did: string; last: ChatMessage; unread: boolean }) {
  const person = usePerson(did)
  return (
    <Link
      to={`/messages/${did}`}
      className="flex items-center gap-3 border-b border-stone-200 px-4 py-3 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900/50"
    >
      <Avatar cid={person.avatar} name={person.name} seed={did} />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className={`truncate ${unread ? 'font-extrabold' : 'font-bold'}`}>{person.name}</span>
          <span className="shrink-0 text-sm text-stone-500">· {timeAgo(last.createdAt)}</span>
        </p>
        <p className={`truncate text-sm ${unread ? 'font-semibold text-stone-900 dark:text-white' : 'text-stone-500'}`}>
          {last.mine && 'You: '}
          {last.text}
        </p>
      </div>
      {unread && (
        <span className="size-2.5 shrink-0 rounded-full bg-brand-500">
          <span className="sr-only">Unread</span>
        </span>
      )}
    </Link>
  )
}

function NewConversation() {
  const { network } = useApp()
  const own = useOwnManifest()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const people = network
    ? [...network.people.values()]
        .filter((p) => p.did !== own?.author)
        .filter((p) => !q || p.manifest.profile.displayName.toLowerCase().includes(q) || p.did === query.trim())
        .sort((a, b) => a.depth - b.depth)
        .slice(0, 8)
    : []
  const direct = query.trim().startsWith('did:key:') ? query.trim() : null
  return (
    <div className="border-b border-stone-200 p-4 dark:border-stone-800">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people or paste a SocialKey ID"
        className={inputClass}
        autoFocus
      />
      <div className="mt-2">
        {direct && (
          <button
            type="button"
            onClick={() => navigate(`/messages/${direct}`)}
            className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Message <span className="font-mono">{shortDid(direct)}</span>
          </button>
        )}
        {people.map((p) => (
          <button
            key={p.did}
            type="button"
            onClick={() => navigate(`/messages/${p.did}`)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <Avatar cid={p.manifest.profile.avatar} name={p.manifest.profile.displayName} seed={p.did} size="sm" />
            <span className="font-semibold">{p.manifest.profile.displayName}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function Chat() {
  const { did = '' } = useParams()
  const { network, toast } = useApp()
  const client = useQueryClient()
  const me = useMe().data
  const person = usePerson(did)
  const chats = useConversations(network)
  const { blocked } = useModeration()
  const messages = blocked.has(did) ? [] : (chats.data?.get(did) ?? [])
  const [text, setText] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => rememberContact(did), [did])
  useEffect(() => {
    const last = messages.at(-1)
    if (last) markRead(did, last.createdAt)
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [did, messages])
  // Check the other person's profile for replies more often while the chat is open.
  useEffect(() => {
    const timer = setInterval(() => client.invalidateQueries({ queryKey: ['manifest', did] }), 15_000)
    return () => clearInterval(timer)
  }, [client, did])

  const send = useMutation({
    mutationFn: () => agent.sendMessage(did, text.trim()),
    onSuccess: async () => {
      setText('')
      await client.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => toast(err.message, 'error'),
  })

  if (!me) return null
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col sm:h-dvh">
      <PageHeader title={person.name} subtitle={person.handle ? `@${person.handle}` : shortDid(did)} back>
        <Link to={`/u/${did}`}>
          <Avatar cid={person.avatar} name={person.name} seed={did} size="sm" />
        </Link>
      </PageHeader>
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        <p className="mx-auto mb-4 flex w-fit items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500 dark:bg-stone-900">
          <Lock className="size-3" /> Only you and {person.name} can read these messages
        </p>
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const gap = !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 15 * 60_000
          return (
            <div key={m.id}>
              {gap && <p className="py-2 text-center text-xs text-stone-400">{fullDate(m.createdAt)}</p>}
              <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <p
                  title={fullDate(m.createdAt)}
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-[15px] whitespace-pre-wrap break-words ${m.mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-stone-100 dark:bg-stone-800'}`}
                >
                  {m.text}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>
      {blocked.has(did) ? (
        <p className="border-t border-stone-200 p-4 text-center text-sm text-stone-500 dark:border-stone-800">
          You blocked this account. Unblock them from their profile to message them.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) send.mutate()
          }}
          className="flex items-end gap-2 border-t border-stone-200 p-3 dark:border-stone-800"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (text.trim()) send.mutate()
              }
            }}
            rows={1}
            placeholder="Write a message"
            className={`${inputClass} max-h-32 resize-none rounded-3xl`}
          />
          <Button
            type="submit"
            aria-label="Send"
            busy={send.isPending}
            disabled={!text.trim()}
            className="size-11 shrink-0 p-0"
          >
            {!send.isPending && <ArrowUp className="size-5" />}
          </Button>
        </form>
      )}
    </div>
  )
}
