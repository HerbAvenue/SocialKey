import type { z } from 'zod'
import { decode } from './encoding'
import {
  type Manifest,
  ManifestSchema,
  type Message,
  type MessagePage,
  MessagePageSchema,
  MessageSchema,
  type Post,
  type PostPage,
  PostPageSchema,
  PostSchema,
} from './schemas'
import { verify } from './sign'

export class InvalidObjectError extends Error {}

/**
 * Decode, validate, and verify a fetched post. Verification runs on the raw
 * decoded object so unknown fields still count toward the signature.
 */
export function readPost(bytes: Uint8Array): Post {
  return readSigned(bytes, PostSchema)
}

export function readManifest(bytes: Uint8Array): Manifest {
  return readSigned(bytes, ManifestSchema)
}

export function readPostPage(bytes: Uint8Array): PostPage {
  const result = PostPageSchema.safeParse(decode(bytes))
  if (!result.success) throw new InvalidObjectError(`Invalid post-page: ${result.error.message}`)
  return result.data
}

export function readMessage(bytes: Uint8Array): Message {
  const result = MessageSchema.safeParse(decode(bytes))
  if (!result.success) throw new InvalidObjectError(`Invalid message: ${result.error.message}`)
  return result.data
}

export function readMessagePage(bytes: Uint8Array): MessagePage {
  const result = MessagePageSchema.safeParse(decode(bytes))
  if (!result.success) throw new InvalidObjectError(`Invalid message page: ${result.error.message}`)
  return result.data
}

function readSigned<S extends z.ZodType<{ author: string; sig: Uint8Array; type: string }>>(
  bytes: Uint8Array,
  schema: S,
): z.infer<S> {
  const raw = decode(bytes)
  const result = schema.safeParse(raw)
  if (!result.success) throw new InvalidObjectError(`Invalid object: ${result.error.message}`)
  if (!verify(raw as z.infer<S>)) throw new InvalidObjectError(`Bad signature on ${result.data.type}`)
  return result.data
}
