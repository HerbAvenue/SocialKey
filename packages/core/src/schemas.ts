import { CID } from 'multiformats/cid'
import { z } from 'zod'

export const MAX_RECENT_POSTS = 50
export const POST_PAGE_SIZE = 25
export const MAX_POST_LENGTH = 1000
export const MAX_MEDIA_PER_POST = 4
export const MAX_MENTIONS = 20
export const MAX_LIKES = 500
export const MAX_MESSAGE_LENGTH = 4000
export const MESSAGES_PER_PAGE = 50

export const cidLink = z.custom<CID>((v) => CID.asCID(v) !== null, 'Expected a CID link')
export const didKey = z.string().regex(/^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+$/, 'Expected an Ed25519 did:key')
const signature = z.instanceof(Uint8Array).refine((b) => b.length === 64, 'Expected a 64-byte signature')
const timestamp = z.iso.datetime()
/** A domain the user controls, proven by a `_socialkey.<domain>` DNS TXT record (see `handle.ts`). */
export const handle = z
  .string()
  .max(253)
  .regex(
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'Expected a domain like alice.example.com',
  )

export const ProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(64),
  bio: z.string().max(500).optional(),
  avatar: cidLink.optional(),
  banner: cidLink.optional(),
  website: z.url().max(200).optional(),
  location: z.string().max(64).optional(),
  handle: handle.optional(),
})

export const PostSchema = z.object({
  type: z.literal('post'),
  version: z.literal(1),
  author: didKey,
  createdAt: timestamp,
  text: z.string().max(MAX_POST_LENGTH),
  media: z.array(cidLink).max(MAX_MEDIA_PER_POST),
  replyTo: cidLink.optional(),
  quoteOf: cidLink.optional(),
  /** A repost has empty text and no media; it shares `repostOf` with the reposter's followers. */
  repostOf: cidLink.optional(),
  /** People the text mentions, so their apps can notify them. */
  mentions: z.array(didKey).max(MAX_MENTIONS).optional(),
  sig: signature,
})

export const ManifestSchema = z.object({
  type: z.literal('manifest'),
  version: z.literal(1),
  author: didKey,
  updatedAt: timestamp,
  profile: ProfileSchema,
  follows: z.array(didKey),
  posts: z.array(cidLink).max(MAX_RECENT_POSTS),
  olderPosts: cidLink.optional(),
  /** Posts this user liked, newest first. Likes are public, like on other networks. */
  likes: z.array(cidLink).max(MAX_LIKES).optional(),
  pinned: cidLink.optional(),
  /** Newest page of this user's sent direct messages (encrypted; see dm.ts). */
  messages: cidLink.optional(),
  sig: signature,
})

// Pages are not signed: they are only reachable through a signed manifest's CID links.
export const PostPageSchema = z.object({
  type: z.literal('post-page'),
  version: z.literal(1),
  posts: z.array(cidLink).min(1),
  prev: cidLink.optional(),
})

/** An encrypted direct message, stored by its sender. Only the tag is visible. */
export const MessageSchema = z.object({
  type: z.literal('message'),
  version: z.literal(1),
  tag: z.string().regex(/^[0-9a-f]{32}$/),
  nonce: z.instanceof(Uint8Array).refine((b) => b.length === 24, 'Expected a 24-byte nonce'),
  // Room for MAX_MESSAGE_LENGTH characters of UTF-8 plus JSON and the auth tag.
  ciphertext: z.instanceof(Uint8Array).refine((b) => b.length <= MAX_MESSAGE_LENGTH * 4 + 256, 'Message too long'),
})

export const MessagePageSchema = z.object({
  type: z.literal('message-page'),
  version: z.literal(1),
  messages: z.array(cidLink).min(1).max(MESSAGES_PER_PAGE),
  prev: cidLink.optional(),
})

export type Profile = z.infer<typeof ProfileSchema>
export type Post = z.infer<typeof PostSchema>
export type Manifest = z.infer<typeof ManifestSchema>
export type PostPage = z.infer<typeof PostPageSchema>
export type Message = z.infer<typeof MessageSchema>
export type MessagePage = z.infer<typeof MessagePageSchema>
export type Unsigned<T extends { sig: Uint8Array }> = Omit<T, 'sig'>
