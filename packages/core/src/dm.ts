import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { bytesToHex, bytesToUtf8, randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { base64 } from 'multiformats/bases/base64'
import { didToPublicKey } from './did'
import type { Message } from './schemas'

/**
 * Direct messages.
 *
 * Two people share a secret: X25519 over their Ed25519 keys. From it come a
 * conversation key (XChaCha20-Poly1305) and a conversation tag. Each message
 * is stored in its sender's profile, labelled only with the tag, which nobody
 * but the two participants can compute, so outsiders can't tell who it's for.
 */
export interface Conversation {
  key: Uint8Array
  /** Hex label on every message in this conversation, the same for both people. */
  tag: string
}

export interface MessageContent {
  text: string
  createdAt: string
}

/** Derives the conversation between `myDid` (whose secret key this is) and `theirDid`. */
export function conversationWith(mySecretKey: Uint8Array, myDid: string, theirDid: string): Conversation {
  const shared = x25519.getSharedSecret(
    ed25519.utils.toMontgomerySecret(mySecretKey),
    ed25519.utils.toMontgomery(didToPublicKey(theirDid)),
  )
  // Both sides must derive the same values, so the salt orders the two dids.
  const salt = utf8ToBytes([myDid, theirDid].sort().join('|'))
  return {
    key: hkdf(sha256, shared, salt, utf8ToBytes('socialkey dm key v1'), 32),
    tag: bytesToHex(hkdf(sha256, shared, salt, utf8ToBytes('socialkey dm tag v1'), 16)),
  }
}

/** Encrypts message content. The sender's did is bound in, so a message can't be replayed as the other person's. */
export function sealMessage(
  conversation: Conversation,
  senderDid: string,
  content: MessageContent,
): Omit<Message, 'type' | 'version'> {
  const nonce = randomBytes(24)
  const plaintext = utf8ToBytes(JSON.stringify(content))
  const ciphertext = xchacha20poly1305(conversation.key, nonce, utf8ToBytes(senderDid)).encrypt(plaintext)
  return { tag: conversation.tag, nonce, ciphertext }
}

/** Decrypts a message from `senderDid`, or returns null if it isn't for this conversation or was tampered with. */
export function openMessage(conversation: Conversation, senderDid: string, message: Message): MessageContent | null {
  if (message.tag !== conversation.tag) return null
  try {
    const plaintext = xchacha20poly1305(conversation.key, message.nonce, utf8ToBytes(senderDid)).decrypt(
      message.ciphertext,
    )
    const content = JSON.parse(bytesToUtf8(plaintext)) as MessageContent
    return typeof content.text === 'string' && typeof content.createdAt === 'string' ? content : null
  } catch {
    return null
  }
}

/** Base64 for passing conversation keys over JSON. */
export function toBase64(bytes: Uint8Array): string {
  return base64.baseEncode(bytes)
}

export function fromBase64(value: string): Uint8Array {
  return base64.baseDecode(value)
}
