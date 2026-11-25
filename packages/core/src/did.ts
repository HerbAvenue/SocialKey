import { base36 } from 'multiformats/bases/base36'
import { base58btc } from 'multiformats/bases/base58'
import { CID } from 'multiformats/cid'
import { identity } from 'multiformats/hashes/identity'

// Multicodec prefix for an Ed25519 public key (varint 0xed).
const ED25519_PUB = new Uint8Array([0xed, 0x01])
// Multicodec for libp2p public keys, used as the CID codec of IPNS names.
const LIBP2P_KEY = 0x72
// Protobuf header of a libp2p PublicKey message: KeyType = Ed25519, 32 data bytes.
const LIBP2P_ED25519_PUB = new Uint8Array([0x08, 0x01, 0x12, 0x20])

const DID_KEY_PREFIX = 'did:key:'

export function publicKeyToDid(publicKey: Uint8Array): string {
  assertPublicKey(publicKey)
  return DID_KEY_PREFIX + base58btc.encode(concat(ED25519_PUB, publicKey))
}

export function didToPublicKey(did: string): Uint8Array {
  if (!did.startsWith(DID_KEY_PREFIX)) throw new Error(`Not a did:key: ${did}`)
  const bytes = base58btc.decode(did.slice(DID_KEY_PREFIX.length))
  if (!startsWith(bytes, ED25519_PUB)) throw new Error(`Not an Ed25519 did:key: ${did}`)
  const publicKey = bytes.slice(ED25519_PUB.length)
  assertPublicKey(publicKey)
  return publicKey
}

/** The base36 (`k51…`) IPNS name controlled by an Ed25519 public key. */
export function publicKeyToIpnsName(publicKey: Uint8Array): string {
  assertPublicKey(publicKey)
  const digest = identity.digest(concat(LIBP2P_ED25519_PUB, publicKey))
  return CID.createV1(LIBP2P_KEY, digest).toString(base36)
}

export function didToIpnsName(did: string): string {
  return publicKeyToIpnsName(didToPublicKey(did))
}

export function ipnsNameToDid(name: string): string {
  const cid = CID.parse(name, base36)
  if (cid.code !== LIBP2P_KEY || cid.multihash.code !== identity.code) {
    throw new Error(`Not an inline-key IPNS name: ${name}`)
  }
  const { digest } = cid.multihash
  if (!startsWith(digest, LIBP2P_ED25519_PUB)) throw new Error(`Not an Ed25519 IPNS name: ${name}`)
  return publicKeyToDid(digest.slice(LIBP2P_ED25519_PUB.length))
}

function assertPublicKey(publicKey: Uint8Array): void {
  if (publicKey.length !== 32) throw new Error(`Ed25519 public key must be 32 bytes, got ${publicKey.length}`)
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b)
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}
