import { type CID, MAX_MEDIA_PER_POST, MAX_POST_LENGTH } from '@socialkey/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Image, X } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { agent } from '../lib/agent'
import { useOwnManifest } from '../lib/queries'
import type { Person } from '../lib/social'
import { useApp } from './AppContext'
import { Avatar } from './Avatar'
import { QuotedPost } from './PostCard'
import { Button } from './ui'

/** Text box for new posts, replies and quotes. */
export function Composer({
  replyTo,
  quoteOf,
  autoFocus = false,
  placeholder,
  onDone,
}: {
  replyTo?: CID
  quoteOf?: CID
  autoFocus?: boolean
  placeholder?: string
  onDone?: () => void
}) {
  const { network, toast } = useApp()
  const client = useQueryClient()
  const own = useOwnManifest()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [mentions, setMentions] = useState<Map<string, string>>(new Map())
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(
    () => () => {
      for (const url of previews) URL.revokeObjectURL(url)
    },
    [previews],
  )

  // Grow with the text instead of scrolling inside a tiny box.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text changes
  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    // scrollHeight is 0 while hidden; keep the CSS min-height then.
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`
  }, [text])

  const suggestions = useMemo<Person[]>(() => {
    if (mentionQuery === null || !network) return []
    const q = mentionQuery.toLowerCase()
    return [...network.people.values()]
      .filter((p) => p.did !== own?.author)
      .filter((p) => p.manifest.profile.displayName.toLowerCase().includes(q) || p.manifest.profile.handle?.includes(q))
      .sort((a, b) => a.depth - b.depth)
      .slice(0, 5)
  }, [mentionQuery, network, own?.author])

  const publish = useMutation({
    mutationFn: async () => {
      const media = await Promise.all(files.map(async (f) => (await agent.uploadMedia(f)).cid))
      // Keep only mentions whose @name is still in the text.
      const mentioned = [...mentions].filter(([name]) => text.includes(`@${name}`)).map(([, did]) => did)
      return agent.createPost({
        text: text.trim(),
        media,
        replyTo: replyTo?.toString(),
        quoteOf: quoteOf?.toString(),
        mentions: mentioned,
      })
    },
    onSuccess: async () => {
      setText('')
      setFiles([])
      setMentions(new Map())
      toast(replyTo ? 'Reply posted' : 'Posted')
      onDone?.()
      await client.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => toast(err.message, 'error'),
  })

  const updateMentionQuery = (value: string, caret: number) => {
    const match = value.slice(0, caret).match(/(^|\s)@([\p{L}\p{N}_.-]{0,32})$/u)
    setMentionQuery(match ? (match[2] ?? '') : null)
    setHighlight(0)
  }

  const insertMention = (person: Person) => {
    const el = textarea.current
    if (!el) return
    const caret = el.selectionStart
    const name = person.manifest.profile.handle ?? person.manifest.profile.displayName.replace(/\s+/g, '')
    const before = text.slice(0, caret).replace(/@[\p{L}\p{N}_.-]*$/u, `@${name} `)
    setText(before + text.slice(caret))
    setMentions((m) => new Map(m).set(name, person.did))
    setMentionQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(before.length, before.length)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const person = suggestions[highlight]
        if (person) insertMention(person)
        return
      }
      if (e.key === 'Escape') return setMentionQuery(null)
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
  }

  const remaining = MAX_POST_LENGTH - text.length
  const canPost = (text.trim().length > 0 || files.length > 0 || quoteOf !== undefined) && remaining >= 0
  const submit = () => canPost && !publish.isPending && publish.mutate()

  return (
    <div className="flex gap-3">
      <Avatar cid={own?.profile.avatar} name={own?.profile.displayName ?? '?'} seed={own?.author} />
      <div className="relative min-w-0 flex-1">
        <textarea
          ref={textarea}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => {
            setText(e.target.value)
            updateMentionQuery(e.target.value, e.target.selectionStart)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          rows={2}
          placeholder={placeholder ?? (replyTo ? 'Post your reply' : quoteOf ? 'Add a comment' : "What's happening?")}
          className="block max-h-96 min-h-14 w-full resize-none bg-transparent py-2 text-lg outline-none placeholder:text-stone-400"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-30 w-72 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900">
            {suggestions.map((person, i) => (
              <li key={person.did}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertMention(person)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${i === highlight ? 'bg-stone-100 dark:bg-stone-800' : ''}`}
                >
                  <Avatar
                    cid={person.manifest.profile.avatar}
                    name={person.manifest.profile.displayName}
                    seed={person.did}
                    size="sm"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{person.manifest.profile.displayName}</span>
                    {person.manifest.profile.handle && (
                      <span className="block truncate text-xs text-stone-500">@{person.manifest.profile.handle}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {previews.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {previews.map((url, i) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="aspect-video w-full rounded-xl object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {quoteOf && <QuotedPost cid={quoteOf} />}
        <div className="mt-2 flex items-center gap-3 border-t border-stone-200 pt-2 dark:border-stone-800">
          <label
            className={`rounded-full p-2 text-brand-600 hover:bg-brand-500/10 ${files.length >= MAX_MEDIA_PER_POST ? 'pointer-events-none opacity-40' : 'cursor-pointer'}`}
            title="Add images"
          >
            <Image className="size-5" />
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                setFiles((f) => [...f, ...(e.target.files ?? [])].slice(0, MAX_MEDIA_PER_POST))
                e.target.value = ''
              }}
            />
          </label>
          <span className="ml-auto flex items-center gap-3">
            {text.length > 0 && <CharacterRing remaining={remaining} />}
            <Button onClick={submit} disabled={!canPost} busy={publish.isPending}>
              {replyTo ? 'Reply' : 'Post'}
            </Button>
          </span>
        </div>
      </div>
    </div>
  )
}

function CharacterRing({ remaining }: { remaining: number }) {
  const used = Math.min(1, (MAX_POST_LENGTH - remaining) / MAX_POST_LENGTH)
  const r = 9
  const circumference = 2 * Math.PI * r
  const color = remaining < 0 ? 'stroke-red-500' : remaining < 50 ? 'stroke-amber-500' : 'stroke-brand-500'
  return (
    <span className="flex items-center gap-1.5 text-xs tabular-nums text-stone-500">
      {remaining < 50 && <span className={remaining < 0 ? 'text-red-500' : ''}>{remaining}</span>}
      <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="2.5"
          className="stroke-stone-200 dark:stroke-stone-800"
        />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="2.5"
          className={color}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - used)}
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
