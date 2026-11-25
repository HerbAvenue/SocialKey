import { readFile, rename, writeFile } from 'node:fs/promises'
import {
  appendMessage,
  CID,
  cidOf,
  conversationWith,
  emptyManifest,
  encode,
  follow,
  type Identity,
  like,
  MAX_MESSAGE_LENGTH,
  type Manifest,
  ManifestSchema,
  type Message,
  MessageSchema,
  type Post,
  type PostPage,
  PostSchema,
  type Profile,
  ProfileSchema,
  prependPost,
  readManifest,
  readMessagePage,
  readPost,
  readPostPage,
  removeRecentPost,
  sealMessage,
  setPinned,
  sign,
  stripSignature,
  toBase64,
  type UnsignedManifest,
  unfollow,
  unlike,
  withOlderPosts,
} from '@socialkey/core'
import type { Kubo } from './kubo'

export interface NewPost {
  text: string
  media?: string[]
  replyTo?: string
  quoteOf?: string
  repostOf?: string
  mentions?: string[]
}

export class NotFoundError extends Error {}

/** Profile fields to change; `null` removes an optional field. CIDs are strings. */
export type ProfilePatch = {
  [K in keyof Profile]?: K extends 'displayName' ? string : string | null
}

interface Deps {
  kubo: Kubo
  identity: Identity
  keyName: string
  /** Where the latest signed manifest's DAG-JSON bytes are kept. */
  stateFile: string
  now?: () => Date
  log?: (message: string) => void
  /** How long to wait before retrying a failed IPNS publish. */
  publishRetryMs?: number
}

const PUBLISH_RETRY_MS = 30_000

/**
 * Owns the user's manifest. Every change is applied one at a time:
 * build → sign → store in Kubo → publish to IPNS → persist locally.
 */
export class Publisher {
  private manifest!: Manifest
  private manifestCid!: CID
  private queue: Promise<unknown> = Promise.resolve()
  private publishing: Promise<void> | undefined
  private publishAgain = false
  private publishedCid: CID | undefined
  private closed = false
  private readonly now: () => Date

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? (() => new Date())
  }

  /**
   * Loads the saved manifest. Without one, `recover` first looks for this
   * identity's profile on the network (after restoring a key or reinstalling),
   * so an existing profile is never overwritten by a blank one.
   */
  async init(defaultDisplayName: string, { recover = false }: { recover?: boolean } = {}): Promise<void> {
    let bytes: Uint8Array
    try {
      bytes = await readFile(this.deps.stateFile)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      if (recover && (await this.recoverFromNetwork())) return
      await this.commit(emptyManifest(this.deps.identity.did, defaultDisplayName, this.now()))
      return
    }
    const manifest = readManifest(bytes)
    if (manifest.author !== this.deps.identity.did) {
      throw new Error(`${this.deps.stateFile} belongs to ${manifest.author}, not ${this.deps.identity.did}`)
    }
    this.manifest = manifest
    this.manifestCid = await cidOf(bytes)
    // Re-store and republish in case Kubo's repo was reset since the last run.
    await this.deps.kubo.putBlock(bytes)
    this.schedulePublish()
  }

  private async recoverFromNetwork(): Promise<boolean> {
    const { kubo, identity } = this.deps
    let cid: CID
    let bytes: Uint8Array
    try {
      cid = await kubo.resolveName(identity.ipnsName)
      bytes = await kubo.getBlock(cid)
    } catch {
      return false
    }
    const manifest = readManifest(bytes)
    if (manifest.author !== identity.did) return false
    await kubo.putBlock(bytes)
    await writeFile(this.deps.stateFile, bytes)
    this.manifest = manifest
    this.manifestCid = cid
    // Take back hosting of your own posts; followers have been keeping copies.
    void this.repinOwnContent(manifest)
    return true
  }

  private async repinOwnContent(manifest: Manifest): Promise<void> {
    const { kubo } = this.deps
    const posts = [...manifest.posts]
    for (let next = manifest.olderPosts; next; ) {
      const pageBytes = await kubo.getBlock(next).catch(() => undefined)
      if (!pageBytes) break
      await kubo.putBlock(pageBytes).catch(() => {})
      const page = readPostPage(pageBytes)
      posts.push(...page.posts)
      next = page.prev
    }
    for (const media of [manifest.profile.avatar, manifest.profile.banner])
      if (media) await kubo.pin(media, true).catch(() => {})
    for (const cid of posts) {
      try {
        const postBytes = await kubo.getBlock(cid)
        await kubo.putBlock(postBytes)
        for (const media of readPost(postBytes).media) await kubo.pin(media, true).catch(() => {})
      } catch {
        // Unreachable posts stay with whoever still has them.
      }
    }
  }

  get current(): { manifest: Manifest; cid: CID } {
    return { manifest: this.manifest, cid: this.manifestCid }
  }

  get ipnsName(): string {
    return this.deps.identity.ipnsName
  }

  updateProfile(patch: ProfilePatch): Promise<CID> {
    return this.mutate(async (m) => {
      const profile: Record<string, unknown> = { ...m.profile }
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue
        if (value === null || value === '') delete profile[key]
        else profile[key] = key === 'avatar' || key === 'banner' ? CID.parse(value) : value
      }
      return { ...m, profile: ProfileSchema.parse(profile) }
    })
  }

  follow(did: string): Promise<CID> {
    return this.mutate(async (m) => follow(m, did))
  }

  unfollow(did: string): Promise<CID> {
    return this.mutate(async (m) => unfollow(m, did))
  }

  like(post: string): Promise<CID> {
    return this.mutate(async (m) => like(m, CID.parse(post)))
  }

  unlike(post: string): Promise<CID> {
    return this.mutate(async (m) => unlike(m, CID.parse(post)))
  }

  pin(post: string | null): Promise<CID> {
    return this.mutate(async (m) => {
      const cid = post ? CID.parse(post) : undefined
      if (cid && !(await this.ownsPost(m, cid))) throw new NotFoundError('You can only pin your own posts')
      return setPinned(m, cid)
    })
  }

  /**
   * Removes one of your posts from your profile and unpins its block, so your
   * node stops serving it. Copies others already fetched may still exist.
   */
  deletePost(post: string): Promise<CID> {
    const target = CID.parse(post)
    return this.mutate(async (m) => {
      const next = removeRecentPost(m, target) ?? (await this.removeFromPages(m, target))
      await this.deps.kubo.unpin(target)
      return next
    })
  }

  /** Encrypts a direct message to `to` and adds it to your message pages. */
  sendMessage(to: string, text: string): Promise<{ message: CID; manifest: CID }> {
    if (!text.trim()) throw new RangeError('Message is empty')
    if (text.length > MAX_MESSAGE_LENGTH)
      throw new RangeError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters`)
    let messageCid!: CID
    return this.mutate(async (m) => {
      const conversation = conversationWith(this.deps.identity.secretKey, m.author, to)
      const sealed = sealMessage(conversation, m.author, { text, createdAt: this.now().toISOString() })
      const message: Message = MessageSchema.parse({ type: 'message', version: 1, ...sealed })
      messageCid = await this.store(encode(message))
      const head = m.messages
        ? { cid: m.messages, page: readMessagePage(await this.deps.kubo.getBlock(m.messages)) }
        : undefined
      return { ...m, messages: await this.store(encode(appendMessage(head, messageCid))) }
    }).then((manifest) => ({ message: messageCid, manifest }))
  }

  /**
   * Conversation keys and tags for decrypting messages with these people. Only
   * handed to paired frontends, which already act with your key.
   */
  conversationKeys(dids: string[]): Record<string, { tag: string; key: string }> {
    const { identity } = this.deps
    return Object.fromEntries(
      dids.map((did) => {
        const { tag, key } = conversationWith(identity.secretKey, identity.did, did)
        return [did, { tag, key: toBase64(key) }]
      }),
    )
  }

  addMedia(bytes: Uint8Array): Promise<CID> {
    return this.deps.kubo.addFile(bytes)
  }

  async createPost(input: NewPost): Promise<{ post: CID; manifest: CID }> {
    let postCid!: CID
    const manifestCid = await this.mutate(async (m) => {
      const post = PostSchema.parse(
        sign<Post>(
          {
            type: 'post',
            version: 1,
            author: m.author,
            createdAt: this.now().toISOString(),
            text: input.text,
            media: (input.media ?? []).map((c) => CID.parse(c)),
            replyTo: input.replyTo ? CID.parse(input.replyTo) : undefined,
            quoteOf: input.quoteOf ? CID.parse(input.quoteOf) : undefined,
            repostOf: input.repostOf ? CID.parse(input.repostOf) : undefined,
            mentions: input.mentions?.length ? [...new Set(input.mentions)] : undefined,
          },
          this.deps.identity,
        ),
      )
      postCid = await this.store(encode(post))
      const { manifest, overflow } = prependPost(m, postCid)
      if (!overflow) return manifest
      return withOlderPosts(manifest, await this.store(encode(overflow)))
    })
    return { post: postCid, manifest: manifestCid }
  }

  /**
   * Removes a post from the older-pages chain: the page holding it is rebuilt
   * without it (or dropped if it empties), and every newer page is rebuilt to
   * point at the new chain.
   */
  private async removeFromPages(m: UnsignedManifest, target: CID): Promise<UnsignedManifest> {
    const chain: PostPage[] = []
    for (let next = m.olderPosts; next; ) {
      const page = readPostPage(await this.deps.kubo.getBlock(next))
      chain.push(page)
      if (page.posts.some((c) => c.equals(target))) break
      next = page.prev
    }
    const found = chain.at(-1)
    if (!found?.posts.some((c) => c.equals(target))) throw new NotFoundError(`Post ${target} isn't on your profile`)

    let head = found.prev
    const remaining = found.posts.filter((c) => !c.equals(target))
    if (remaining.length) head = await this.store(encode({ ...found, posts: remaining, prev: head }))
    for (const page of chain.slice(0, -1).reverse()) head = await this.store(encode({ ...page, prev: head }))
    return { ...m, olderPosts: head, pinned: m.pinned?.equals(target) ? undefined : m.pinned }
  }

  private async ownsPost(m: UnsignedManifest, cid: CID): Promise<boolean> {
    if (m.posts.some((c) => c.equals(cid))) return true
    try {
      return readPost(await this.deps.kubo.getBlock(cid)).author === m.author
    } catch {
      return false
    }
  }

  private mutate(change: (m: UnsignedManifest) => Promise<UnsignedManifest>): Promise<CID> {
    const run = this.queue.then(async () => this.commit(await change(stripSignature(this.manifest))))
    this.queue = run.catch(() => {})
    return run
  }

  private async commit(unsigned: UnsignedManifest): Promise<CID> {
    const manifest = ManifestSchema.parse(
      sign<Manifest>({ ...unsigned, updatedAt: this.now().toISOString() }, this.deps.identity),
    )
    const bytes = encode(manifest)
    const cid = await this.store(bytes)
    const tmp = `${this.deps.stateFile}.tmp`
    await writeFile(tmp, bytes)
    await rename(tmp, this.deps.stateFile)
    this.manifest = manifest
    this.manifestCid = cid
    this.schedulePublish()
    return cid
  }

  /**
   * Announces the latest manifest over IPNS in the background. A DHT publish
   * takes tens of seconds on the real network, so changes are saved and shown
   * immediately and the announcement catches up. Changes made meanwhile are
   * folded into one follow-up publish; failures retry.
   */
  private schedulePublish(delayMs = 0): void {
    if (this.publishing) {
      this.publishAgain = true
      return
    }
    this.publishing = (async () => {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
      const cid = this.manifestCid
      try {
        await this.deps.kubo.publish(cid, this.deps.keyName)
        this.publishedCid = cid
      } catch (err) {
        this.deps.log?.(`IPNS publish failed, retrying: ${err instanceof Error ? err.message : err}`)
        this.publishAgain = true
        delayMs = this.deps.publishRetryMs ?? PUBLISH_RETRY_MS
      }
    })().finally(() => {
      this.publishing = undefined
      const again = this.publishAgain || !this.manifestCid.equals(this.publishedCid ?? this.manifestCid)
      this.publishAgain = false
      if (again && !this.closed) this.schedulePublish(this.publishedCid?.equals(this.manifestCid) ? 0 : delayMs)
    })
  }

  /** Waits for any IPNS publish in progress (and the follow-ups it scheduled). */
  async flush(): Promise<void> {
    while (this.publishing) await this.publishing
  }

  /** Stops scheduling publishes. */
  close(): void {
    this.closed = true
  }

  /** The manifest CID most recently announced over IPNS, if any. */
  get published(): CID | undefined {
    return this.publishedCid
  }

  /** Stores DAG-JSON bytes and checks Kubo derived the same CID we did. */
  private async store(bytes: Uint8Array): Promise<CID> {
    const [expected, actual] = await Promise.all([cidOf(bytes), this.deps.kubo.putBlock(bytes)])
    if (!expected.equals(actual)) throw new Error(`Kubo stored ${actual}, expected ${expected}`)
    return expected
  }
}
