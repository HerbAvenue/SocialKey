import { CID } from 'multiformats/cid'
import { z } from 'zod'

export const MAX_RECENT_POSTS = 50
export const POST_PAGE_SIZE = 25
export const MAX_POST_LENGTH = 1000
export const MAX_MEDIA_PER_POST = 4

export const cidLink = z.custom<CID>((v) => CID.asCID(v) !== null, 'Expected a CID link')
export const didKey = z.string().regex(/^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+$/, 'Expected an Ed25519 did:key')
const signature = z.instanceof(Uint8Array).refine((b) => b.length === 64, 'Expected a 64-byte signature')
const timestamp = z.iso.datetime()

export const ProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(64),
  bio: z.string().max(500).optional(),
  avatar: cidLink.optional(),
  banner: cidLink.optional(),
  website: z.url().max(200).optional(),
  location: z.string().max(64).optional(),
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
  sig: signature,
})

// Pages are not signed: they are only reachable through a signed manifest's CID links.
export const PostPageSchema = z.object({
  type: z.literal('post-page'),
  version: z.literal(1),
  posts: z.array(cidLink).min(1),
  prev: cidLink.optional(),
})

export type Profile = z.infer<typeof ProfileSchema>
export type Post = z.infer<typeof PostSchema>
export type Manifest = z.infer<typeof ManifestSchema>
export type PostPage = z.infer<typeof PostPageSchema>
export type Unsigned<T extends { sig: Uint8Array }> = Omit<T, 'sig'>
