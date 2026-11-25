const list = (value: string | undefined, fallback: string): string[] =>
  (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

// When the agent itself serves this app (at /app/), talk to it on the page's own origin:
// no CORS, and it works whether the page was opened via localhost or 127.0.0.1.
const servedByAgent = location.pathname.startsWith('/app/')
export const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? (servedByAgent ? location.origin : 'http://127.0.0.1:4040')
/** Trustless gateways (raw blocks and IPNS records) used when no agent is paired. */
export const GATEWAYS = list(import.meta.env.VITE_GATEWAYS, 'https://trustless-gateway.link,https://dweb.link')
/** Delegated routing endpoints, for IPNS records. */
export const ROUTERS = list(import.meta.env.VITE_ROUTERS, 'https://delegated-ipfs.dev')
/** Subdomain gateway that serves images for visitors, as https://<cid>.ipfs.<host>. */
export const MEDIA_GATEWAY = new URL(import.meta.env.VITE_MEDIA_GATEWAY ?? 'https://dweb.link')
