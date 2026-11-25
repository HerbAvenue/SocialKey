const list = (value: string | undefined, fallback: string): string[] =>
  (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

// When the agent itself serves this app (at /app/), talk to it on the page's own origin:
// no CORS, and it works whether the page was opened via localhost or 127.0.0.1.
const servedByAgent = location.pathname.startsWith('/app/')
export const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? (servedByAgent ? location.origin : 'http://127.0.0.1:4040')
export const GATEWAYS = list(import.meta.env.VITE_GATEWAYS, 'https://trustless-gateway.link')
export const ROUTERS = list(import.meta.env.VITE_ROUTERS, 'https://delegated-ipfs.dev')
