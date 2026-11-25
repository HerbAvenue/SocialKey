const list = (value: string | undefined, fallback: string): string[] =>
  (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

// When the agent itself serves this app (at /app/), talk to it on the page's own origin:
// no CORS, and it works whether the page was opened via localhost or 127.0.0.1.
const servedByAgent = location.pathname.startsWith('/app/')
export const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? (servedByAgent ? location.origin : 'http://127.0.0.1:4040')
/**
 * Trustless gateways (raw blocks and IPNS records) used when no agent is paired.
 * Requests race all of them: public gateways are often rate-limited or down,
 * and blocks are hash-checked, so any one of them answering is enough.
 */
export const GATEWAYS = list(
  import.meta.env.VITE_GATEWAYS,
  'https://trustless-gateway.link,https://gateway.pinata.cloud,https://dweb.link,https://w3s.link',
)
/** Delegated routing endpoints, for IPNS records. */
export const ROUTERS = list(import.meta.env.VITE_ROUTERS, 'https://delegated-ipfs.dev')
/** Image URL templates for visitors, tried in order if one fails to load. `{cid}` is a CIDv1. */
export const MEDIA_GATEWAYS = list(
  import.meta.env.VITE_MEDIA_GATEWAYS,
  'https://{cid}.ipfs.dweb.link/,https://gateway.pinata.cloud/ipfs/{cid},https://{cid}.ipfs.w3s.link/',
)
