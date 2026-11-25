import { ed25519 } from '@noble/curves/ed25519.js'
import { publicKeyToDid, publicKeyToIpnsName } from './did'

export interface Identity {
  secretKey: Uint8Array
  publicKey: Uint8Array
  did: string
  ipnsName: string
}

export function generateSecretKey(): Uint8Array {
  return ed25519.utils.randomSecretKey()
}

export function identityFromSecretKey(secretKey: Uint8Array): Identity {
  const publicKey = ed25519.getPublicKey(secretKey)
  return {
    secretKey,
    publicKey,
    did: publicKeyToDid(publicKey),
    ipnsName: publicKeyToIpnsName(publicKey),
  }
}
