import { normalizeHandle, resolveHandle, type TxtLookup } from '@socialkey/core'

// DNS-over-HTTPS JSON APIs; both allow cross-origin requests from browsers.
const RESOLVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']

interface DohAnswer {
  type: number
  data: string
}

/** TXT records for `name`, trying each resolver in turn. */
export const lookupTxt: TxtLookup = async (name) => {
  let lastError: unknown
  for (const resolver of RESOLVERS) {
    try {
      const res = await fetch(`${resolver}?name=${encodeURIComponent(name)}&type=TXT`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`)
      const body = (await res.json()) as { Answer?: DohAnswer[] }
      // TXT = 16. Long records arrive as several quoted strings: join them.
      return (body.Answer ?? []).filter((a) => a.type === 16).map((a) => a.data.replace(/"\s*"/g, '').replace(/"/g, ''))
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

/** The did:key behind a handle such as `alice.example.com`, or null. */
export async function didForHandle(input: string): Promise<string | null> {
  const handle = normalizeHandle(input)
  return handle ? resolveHandle(handle, lookupTxt) : null
}
