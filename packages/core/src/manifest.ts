import type { CID } from 'multiformats/cid'
import { MAX_RECENT_POSTS, type Manifest, POST_PAGE_SIZE, type PostPage, type Unsigned } from './schemas'

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

export function stripSignature<T extends { sig: Uint8Array }>(signed: T): Unsigned<T> {
  const { sig: _sig, ...unsigned } = signed
  return unsigned
}
