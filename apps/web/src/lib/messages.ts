import { type CID, type Conversation, fromBase64, type Manifest, type Message, openMessage } from '@socialkey/core'
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { agent } from './agent'
import { loadMessage, loadMessagePage } from './ipfs'
import { useMe, useOwnManifest } from './queries'
import type { Network } from './social'

// How far back to read each person's message pages (50 messages each).
const PAGES_PER_PERSON = 2
const CONTACTS_KEY = 'socialkey.dmContacts'

export interface ChatMessage {
  id: string
  /** The other person in the conversation. */
  with: string
  mine: boolean
  text: string
  createdAt: string
}

/** People you've opened a conversation with, so their replies are checked even outside your network. */
export function rememberedContacts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function rememberContact(did: string): void {
  try {
    const contacts = rememberedContacts()
    if (!contacts.includes(did)) localStorage.setItem(CONTACTS_KEY, JSON.stringify([did, ...contacts].slice(0, 200)))
  } catch {
    // Without storage, conversations with people outside your network won't be remembered.
  }
}

const messageQuery = (cid: CID) => ({
  queryKey: ['message', cid.toString()],
  queryFn: () => loadMessage(cid),
  staleTime: Number.POSITIVE_INFINITY,
})

const pageQuery = (cid: CID) => ({
  queryKey: ['message-page', cid.toString()],
  queryFn: () => loadMessagePage(cid),
  staleTime: Number.POSITIVE_INFINITY,
})

/** The newest messages someone has sent anyone, still encrypted. */
async function sentMessages(client: QueryClient, manifest: Manifest): Promise<{ cid: CID; message: Message }[]> {
  const out: { cid: CID; message: Message }[] = []
  let next = manifest.messages
  for (let i = 0; next && i < PAGES_PER_PERSON; i++) {
    const page = await client.fetchQuery(pageQuery(next))
    const loaded = await Promise.allSettled(
      page.messages.map(async (cid) => ({ cid, message: await client.fetchQuery(messageQuery(cid)) })),
    )
    out.push(...loaded.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])))
    next = page.prev
  }
  return out
}

/**
 * All your conversations with people in your network (and anyone you've
 * messaged), decrypted. Messages to you live in the sender's profile, tagged
 * so only you two can recognise them.
 */
export function useConversations(network: Network | undefined) {
  const client = useQueryClient()
  const me = useMe().data
  const own = useOwnManifest()
  const people = network ? [...network.people.values()].filter((p) => p.did !== me?.did) : []
  const candidates = [...new Set([...people.map((p) => p.did), ...rememberedContacts()])].sort()

  return useQuery({
    queryKey: [
      'conversations',
      own?.messages?.toString(),
      candidates.join(','),
      people.map((p) => p.manifest.messages?.toString()).join(','),
    ],
    enabled: me !== undefined && own !== undefined && network !== undefined,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<Map<string, ChatMessage[]>> => {
      if (!own || !me) return new Map()
      const { keys } = await agent.conversationKeys(candidates)
      const conversations = new Map<string, Conversation>(
        Object.entries(keys).map(([did, k]) => [did, { tag: k.tag, key: fromBase64(k.key) }]),
      )
      const byTag = new Map([...conversations].map(([did, c]) => [c.tag, did]))
      const chats = new Map<string, ChatMessage[]>()
      const add = (msg: ChatMessage) => chats.set(msg.with, [...(chats.get(msg.with) ?? []), msg])

      for (const { cid, message } of await sentMessages(client, own)) {
        const other = byTag.get(message.tag)
        const conversation = other ? conversations.get(other) : undefined
        const content = conversation && openMessage(conversation, me.did, message)
        if (other && content) add({ id: cid.toString(), with: other, mine: true, ...content })
      }
      const senders = people.filter((p) => p.manifest.messages)
      await Promise.all(
        senders.map(async (person) => {
          const conversation = conversations.get(person.did)
          if (!conversation) return
          for (const { cid, message } of await sentMessages(client, person.manifest).catch(() => [])) {
            const content = openMessage(conversation, person.did, message)
            if (content) add({ id: cid.toString(), with: person.did, mine: false, ...content })
          }
        }),
      )
      for (const list of chats.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      return chats
    },
  })
}

const READ_KEY = 'socialkey.dmRead'

export function readMarks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function markRead(did: string, at: string): void {
  try {
    const marks = readMarks()
    if ((marks[did] ?? '') >= at) return
    localStorage.setItem(READ_KEY, JSON.stringify({ ...marks, [did]: at }))
    window.dispatchEvent(new Event('socialkey:dm-read'))
  } catch {
    // Unread markers just won't persist.
  }
}

/** Conversations whose newest incoming message you haven't opened. */
export function unreadConversations(
  chats: Map<string, ChatMessage[]> | undefined,
  marks: Record<string, string>,
): number {
  if (!chats) return 0
  let count = 0
  for (const [did, list] of chats) {
    const lastIncoming = list.filter((m) => !m.mine).at(-1)
    if (lastIncoming && lastIncoming.createdAt > (marks[did] ?? '')) count++
  }
  return count
}
