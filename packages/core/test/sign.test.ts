import { describe, expect, it } from 'vitest'
import {
  encode,
  generateSecretKey,
  InvalidObjectError,
  identityFromSecretKey,
  type Post,
  readPost,
  sign,
  verify,
} from '../src'

const alice = identityFromSecretKey(generateSecretKey())
const bob = identityFromSecretKey(generateSecretKey())

function makePost(text = 'hello'): Post {
  return sign<Post>(
    { type: 'post', version: 1, author: alice.did, createdAt: new Date().toISOString(), text, media: [] },
    alice,
  )
}

describe('signing', () => {
  it('verifies a signed post and reads it back from bytes', () => {
    const post = makePost()
    expect(verify(post)).toBe(true)
    expect(readPost(encode(post)).text).toBe('hello')
  })

  it('rejects tampered content', () => {
    const post = { ...makePost(), text: 'tampered' }
    expect(verify(post)).toBe(false)
    expect(() => readPost(encode(post))).toThrow(InvalidObjectError)
  })

  it('rejects a post re-attributed to another author', () => {
    const post = { ...makePost(), author: bob.did }
    expect(verify(post)).toBe(false)
  })

  it('refuses to sign for someone else', () => {
    expect(() =>
      sign<Post>({ type: 'post', version: 1, author: bob.did, createdAt: '', text: '', media: [] }, alice),
    ).toThrow()
  })

  it('counts unknown fields toward the signature', () => {
    const post = sign<Post & { extra: string }>(
      {
        type: 'post',
        version: 1,
        author: alice.did,
        createdAt: new Date().toISOString(),
        text: 'hi',
        media: [],
        extra: 'future field',
      },
      alice,
    )
    expect(() => readPost(encode(post))).not.toThrow()
    expect(() => readPost(encode({ ...post, extra: 'changed' }))).toThrow(InvalidObjectError)
  })

  it('rejects structurally invalid posts', () => {
    const post = makePost('x'.repeat(5000))
    expect(() => readPost(encode(post))).toThrow(/Invalid object/)
  })
})
