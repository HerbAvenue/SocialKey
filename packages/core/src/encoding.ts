import * as dagJson from '@ipld/dag-json'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import { CID } from 'multiformats/cid'
import { from } from 'multiformats/hashes/hasher'

// Pure-JS sha2-256. multiformats' own hasher uses WebCrypto, which browsers hide on
// non-secure origins, such as the agent opened over the local network from a phone.
const sha256 = from({ name: 'sha2-256', code: 0x12, encode: (bytes) => nobleSha256(bytes) })

/**
 * Deterministic DAG-JSON bytes. Keys whose value is `undefined` are dropped,
 * since DAG-JSON cannot represent them and optional fields are often unset.
 */
export function encode(value: unknown): Uint8Array {
  return dagJson.encode(dropUndefined(value))
}

export function decode(bytes: Uint8Array): unknown {
  return dagJson.decode(bytes)
}

/** CIDv1 (dag-json, sha2-256) of already-encoded bytes. */
export async function cidOf(bytes: Uint8Array): Promise<CID> {
  return CID.createV1(dagJson.code, await sha256.digest(bytes))
}

/** True when `bytes` hash to `cid` (sha2-256, any codec). */
export async function blockMatches(cid: CID, bytes: Uint8Array): Promise<boolean> {
  if (cid.multihash.code !== sha256.code) return false
  const digest = (await sha256.digest(bytes)).digest
  const expected = cid.multihash.digest
  return digest.length === expected.length && digest.every((b, i) => b === expected[i])
}

function dropUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropUndefined)
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Uint8Array || CID.asCID(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined) out[key] = dropUndefined(v)
  }
  return out
}
