import type { CID } from 'multiformats/cid'
import {
  MAX_LIKES,
  MAX_RECENT_POSTS,
  type Manifest,
  MESSAGES_PER_PAGE,
  type MessagePage,
  POST_PAGE_SIZE,
  type PostPage,
  type Unsigned,
} from './schemas'

export type UnsignedManifest = Unsigned<Manifest>

export function emptyManifest(author: string, displayName: string, now: Date): UnsignedManifest {
  return {
    type: 'manifest',
    version: 1,
    author,
    updatedAt: now.toISOString(),
    profile: { displayName },
    follows: [],
    posts: [],
  }
}

/**
 * Prepends a post. When the recent list exceeds MAX_RECENT_POSTS, the oldest
 * POST_PAGE_SIZE posts are returned as `overflow`: the caller must store that
 * page and pass its CID to `withOlderPosts`.
 */
export function prependPost(
  manifest: UnsignedManifest,
  post: CID,
): { manifest: UnsignedManifest; overflow?: PostPage } {
  const posts = [post, ...manifest.posts]
  if (posts.length <= MAX_RECENT_POSTS) return { manifest: { ...manifest, posts } }
  const keep = posts.length - POST_PAGE_SIZE
  return {
    manifest: { ...manifest, posts: posts.slice(0, keep) },
    overflow: { type: 'post-page', version: 1, posts: posts.slice(keep), prev: manifest.olderPosts },
  }
}

export function withOlderPosts(manifest: UnsignedManifest, page: CID): UnsignedManifest {
  return { ...manifest, olderPosts: page }
}

export function follow(manifest: UnsignedManifest, did: string): UnsignedManifest {
  if (did === manifest.author || manifest.follows.includes(did)) return manifest
  return { ...manifest, follows: [...manifest.follows, did] }
}

export function unfollow(manifest: UnsignedManifest, did: string): UnsignedManifest {
  return { ...manifest, follows: manifest.follows.filter((d) => d !== did) }
}

export function like(manifest: UnsignedManifest, post: CID): UnsignedManifest {
  const likes = manifest.likes ?? []
  if (likes.some((c) => c.equals(post))) return manifest
  return { ...manifest, likes: [post, ...likes].slice(0, MAX_LIKES) }
}

export function unlike(manifest: UnsignedManifest, post: CID): UnsignedManifest {
  const likes = (manifest.likes ?? []).filter((c) => !c.equals(post))
  return { ...manifest, likes: likes.length ? likes : undefined }
}

export function setPinned(manifest: UnsignedManifest, post: CID | undefined): UnsignedManifest {
  return { ...manifest, pinned: post }
}

/**
 * Removes a post from the recent list (and unpins it). Returns null when it
 * isn't there, i.e. it lives in an older page.
 */
export function removeRecentPost(manifest: UnsignedManifest, post: CID): UnsignedManifest | null {
  if (!manifest.posts.some((c) => c.equals(post))) return null
  const pinned = manifest.pinned?.equals(post) ? undefined : manifest.pinned
  return { ...manifest, posts: manifest.posts.filter((c) => !c.equals(post)), pinned }
}

/**
 * The next head of a sender's message-page chain: the message goes on the
 * current page until it's full, then onto a new page that links back to it.
 */
export function appendMessage(head: { cid: CID; page: MessagePage } | undefined, message: CID): MessagePage {
  if (!head) return { type: 'message-page', version: 1, messages: [message] }
  if (head.page.messages.length < MESSAGES_PER_PAGE) return { ...head.page, messages: [message, ...head.page.messages] }
  return { type: 'message-page', version: 1, messages: [message], prev: head.cid }
}

export function stripSignature<T extends { sig: Uint8Array }>(signed: T): Unsigned<T> {
  const { sig: _sig, ...unsigned } = signed
  return unsigned
}
