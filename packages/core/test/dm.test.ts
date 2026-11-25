import { describe, expect, it } from 'vitest'
import {
  appendMessage,
  cidOf,
  conversationWith,
  encode,
  fromBase64,
  generateSecretKey,
  identityFromSecretKey,
  MESSAGES_PER_PAGE,
  type Message,
  openMessage,
  readMessage,
  sealMessage,
  toBase64,
} from '../src'

const alice = identityFromSecretKey(generateSecretKey())
const bob = identityFromSecretKey(generateSecretKey())
const eve = identityFromSecretKey(generateSecretKey())
const content = { text: 'meet at the café ☕', createdAt: new Date().toISOString() }

function seal(): Message {
  return {
    type: 'message',
    version: 1,
    ...sealMessage(conversationWith(alice.secretKey, alice.did, bob.did), alice.did, content),
  }
}

describe('direct messages', () => {
  it('derives the same conversation on both sides', () => {
    const fromAlice = conversationWith(alice.secretKey, alice.did, bob.did)
    const fromBob = conversationWith(bob.secretKey, bob.did, alice.did)
    expect(fromAlice.tag).toBe(fromBob.tag)
    expect(fromAlice.key).toEqual(fromBob.key)
    expect(conversationWith(alice.secretKey, alice.did, eve.did).tag).not.toBe(fromAlice.tag)
  })

  it('round-trips through DAG-JSON and opens for the recipient', () => {
    const message = readMessage(encode(seal()))
    expect(openMessage(conversationWith(bob.secretKey, bob.did, alice.did), alice.did, message)).toEqual(content)
  })

  it("can't be read by anyone else", () => {
    const eveWithAlice = conversationWith(eve.secretKey, eve.did, alice.did)
    expect(openMessage(eveWithAlice, alice.did, seal())).toBeNull()
  })

  it('rejects tampering and a forged sender', () => {
    const conversation = conversationWith(bob.secretKey, bob.did, alice.did)
    const message = seal()
    const flipped = new Uint8Array(message.ciphertext)
    flipped[0] = (flipped[0] ?? 0) ^ 1
    expect(openMessage(conversation, alice.did, { ...message, ciphertext: flipped })).toBeNull()
    // Claiming Bob sent Alice's message fails: the sender is bound into the encryption.
    expect(openMessage(conversation, bob.did, message)).toBeNull()
  })

  it('round-trips keys through base64', () => {
    const { key } = conversationWith(alice.secretKey, alice.did, bob.did)
    expect(fromBase64(toBase64(key))).toEqual(key)
  })

  it('starts a new page when the head is full', async () => {
    const message = await cidOf(encode({ n: 1 }))
    let head = { cid: await cidOf(encode({ head: 0 })), page: appendMessage(undefined, message) }
    for (let i = 1; i < MESSAGES_PER_PAGE; i++) head = { ...head, page: appendMessage(head, message) }
    expect(head.page.messages).toHaveLength(MESSAGES_PER_PAGE)
    const next = appendMessage(head, message)
    expect(next.messages).toHaveLength(1)
    expect(next.prev).toEqual(head.cid)
  })
})
