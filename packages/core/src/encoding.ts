import * as dagJson from '@ipld/dag-json'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'

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
