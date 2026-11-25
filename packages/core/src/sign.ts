import { ed25519 } from '@noble/curves/ed25519.js'
import { didToPublicKey } from './did'
import { encode } from './encoding'
import type { Identity } from './keys'

interface Signed {
  author: string
  sig: Uint8Array
}

/** Signs the DAG-JSON encoding of `unsigned` (which must not contain `sig`). */
export function sign<T extends Signed>(unsigned: Omit<T, 'sig'>, identity: Identity): T {
  if (unsigned.author !== identity.did) {
    throw new Error(`Cannot sign for ${unsigned.author} with key ${identity.did}`)
  }
  if ('sig' in unsigned) throw new Error('Object is already signed')
  const sig = ed25519.sign(encode(unsigned), identity.secretKey)
  return { ...unsigned, sig } as T
}

/** True when `sig` is a valid signature by `author` over the object minus `sig`. */
export function verify(signed: Signed): boolean {
  const { sig, ...unsigned } = signed
  try {
    return ed25519.verify(sig, encode(unsigned), didToPublicKey(signed.author))
  } catch {
    return false
  }
}
