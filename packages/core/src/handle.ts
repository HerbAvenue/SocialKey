import { didKey, handle as handleSchema } from './schemas'

/**
 * Domain handles: `alice.example.com` is Alice's handle when the DNS TXT record
 * `_socialkey.alice.example.com` contains `did=<her did:key>`. DNS lookups are
 * passed in so this stays environment-neutral (the web app uses DNS-over-HTTPS).
 */
export type TxtLookup = (name: string) => Promise<string[]>

export function handleRecordName(handle: string): string {
  return `_socialkey.${handle}`
}

export function handleRecordValue(did: string): string {
  return `did=${did}`
}

export function normalizeHandle(input: string): string | null {
  const handle = input.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '')
  return handleSchema.safeParse(handle).success ? handle : null
}

/** The did:key a handle points to, or null if it has no valid record. */
export async function resolveHandle(handle: string, lookup: TxtLookup): Promise<string | null> {
  const records = await lookup(handleRecordName(handle))
  const dids = records
    .map((r) => r.trim().replace(/^"|"$/g, ''))
    .filter((r) => r.startsWith('did='))
    .map((r) => r.slice(4))
    .filter((did) => didKey.safeParse(did).success)
  // Ambiguous records prove nothing.
  return new Set(dids).size === 1 ? (dids[0] ?? null) : null
}

/** True when `handle`'s DNS record points back at `did`. */
export async function verifyHandle(handle: string, did: string, lookup: TxtLookup): Promise<boolean> {
  return (await resolveHandle(handle, lookup)) === did
}
