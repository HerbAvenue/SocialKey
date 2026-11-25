/**
 * Checks whether other people can reach your SocialKey profile from the
 * internet, not just from this computer.
 *
 *   KUBO_API=http://127.0.0.1:45001 SOCIALKEY_DATA_DIR=~/.socialkey tsx scripts/doctor.ts
 *
 * (The desktop app's Kubo API is on port 45001; a standalone `ipfs daemon` uses 5001.)
 * It only reads: it never publishes or changes anything.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadOrCreateIdentity } from '../src/keystore'

const KUBO_API = process.env.KUBO_API ?? 'http://127.0.0.1:5001'
const DATA_DIR = process.env.SOCIALKEY_DATA_DIR ?? join(homedir(), '.socialkey')
const ROUTER = process.env.SOCIALKEY_ROUTER ?? 'https://delegated-ipfs.dev'
const GATEWAY = process.env.SOCIALKEY_TRUSTLESS_GATEWAY ?? 'https://trustless-gateway.link'

type Status = 'ok' | 'warn' | 'fail'
const results: { status: Status; check: string; detail: string }[] = []
const report = (status: Status, check: string, detail: string) => {
  results.push({ status, check, detail })
  const mark = { ok: '✓', warn: '!', fail: '✗' }[status]
  console.log(`${mark} ${check}\n    ${detail}`)
}

async function kubo<T>(command: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${KUBO_API}/api/v0/${command}?${new URLSearchParams(params)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`${command} failed (${res.status}): ${(await res.text()).trim()}`)
  return (await res.json()) as T
}

async function get(url: string, accept: string, timeoutMs = 60_000): Promise<Response> {
  return fetch(url, { headers: { accept }, signal: AbortSignal.timeout(timeoutMs) })
}

/** True for addresses only reachable inside this machine or home network. */
function isPrivate(addr: string): boolean {
  return /\/ip4\/(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)|\/ip6\/(::1|f[cd]|fe80)/i.test(
    addr,
  )
}

const { identity } = await loadOrCreateIdentity(DATA_DIR)
console.log(`SocialKey doctor\n  Profile: ${identity.did}\n  IPNS:    ${identity.ipnsName}\n  Kubo:    ${KUBO_API}\n`)

// 1. Is Kubo running and connected?
let peerId = ''
try {
  const id = await kubo<{ ID: string; Addresses: string[] | null }>('id')
  peerId = id.ID
  const addresses = id.Addresses ?? []
  const publicAddrs = addresses.filter((a) => !isPrivate(a) && !a.includes('/p2p-circuit'))
  const relayAddrs = addresses.filter((a) => a.includes('/p2p-circuit'))
  if (publicAddrs.length > 0) {
    report(
      'ok',
      'Directly reachable',
      `Your node announces ${publicAddrs.length} public address(es), e.g. ${publicAddrs[0]}`,
    )
  } else if (relayAddrs.length > 0) {
    report(
      'warn',
      'Reachable through a relay only',
      'Others reach you via a relay node. It works, but it is slower; forwarding a port on your router helps.',
    )
  } else {
    report(
      'fail',
      'Not reachable from the internet',
      'Your node only has private addresses. Others cannot fetch your posts until a follower hosts them or you forward a port.',
    )
  }
} catch (err) {
  report('fail', 'Kubo is running', `Can't reach Kubo at ${KUBO_API}: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}

try {
  const peers = await kubo<{ Peers: unknown[] | null }>('swarm/peers')
  const count = peers.Peers?.length ?? 0
  report(
    count >= 10 ? 'ok' : count > 0 ? 'warn' : 'fail',
    'Connected to the IPFS network',
    `${count} peer(s) connected.`,
  )
} catch (err) {
  const offline = err instanceof Error && /online mode/.test(err.message)
  report(
    'fail',
    'Connected to the IPFS network',
    offline
      ? 'Kubo is running in offline mode, so nobody else can reach it.'
      : `${err instanceof Error ? err.message : err}`,
  )
}

// 2. Which manifest does your name point to locally?
let manifestCid = ''
try {
  const resolved = await kubo<{ Path: string }>('name/resolve', { arg: identity.ipnsName, offline: 'true' })
  manifestCid = resolved.Path.replace(/^\/ipfs\//, '')
  report('ok', 'Profile published locally', `Your name points to ${manifestCid}`)
} catch {
  report(
    'fail',
    'Profile published locally',
    'Your node has no record for your name yet. Is the SocialKey app running?',
  )
}

// 3. Can the rest of the network find your name?
try {
  const started = Date.now()
  const res = await get(`${ROUTER}/routing/v1/ipns/${identity.ipnsName}`, 'application/vnd.ipfs.ipns-record')
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (res.ok) report('ok', 'Name visible to the network', `${ROUTER} returned your IPNS record in ${seconds}s.`)
  else
    report(
      'fail',
      'Name visible to the network',
      `${ROUTER} has no record for your name (${res.status}). New records can take a few minutes to spread.`,
    )
} catch (err) {
  report('fail', 'Name visible to the network', `Lookup failed: ${err instanceof Error ? err.message : err}`)
}

if (manifestCid) {
  // 4. Does the network know who has your manifest?
  try {
    const res = await get(`${ROUTER}/routing/v1/providers/${manifestCid}`, 'application/json')
    const body = res.ok ? ((await res.json()) as { Providers?: { ID?: string }[] | null }) : { Providers: [] }
    const providers = body.Providers ?? []
    const self = providers.some((p) => p.ID === peerId)
    if (self)
      report(
        'ok',
        'Your node is announced as a host',
        `${providers.length} host(s) found for your profile, including you.`,
      )
    else if (providers.length > 0)
      report(
        'warn',
        'Others host your profile',
        `${providers.length} host(s) found, but not your own node yet. Announcements can lag by a few minutes.`,
      )
    else report('fail', 'Your node is announced as a host', 'Nobody is listed as hosting your profile yet.')
  } catch (err) {
    report('warn', 'Your node is announced as a host', `Lookup failed: ${err instanceof Error ? err.message : err}`)
  }

  // 5. The real test: can a stranger's browser fetch your profile through a public gateway?
  try {
    const started = Date.now()
    const res = await get(`${GATEWAY}/ipfs/${manifestCid}`, 'application/vnd.ipld.raw', 90_000)
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    if (res.ok)
      report('ok', 'Profile loads for visitors without the app', `${GATEWAY} served your profile in ${seconds}s.`)
    else
      report(
        'fail',
        'Profile loads for visitors without the app',
        `${GATEWAY} couldn't fetch your profile (${res.status}).`,
      )
  } catch (err) {
    report(
      'fail',
      'Profile loads for visitors without the app',
      `Timed out or failed: ${err instanceof Error ? err.message : err}`,
    )
  }
}

const failed = results.filter((r) => r.status === 'fail').length
const warned = results.filter((r) => r.status === 'warn').length
console.log(
  failed
    ? `\n${failed} problem(s), ${warned} warning(s).`
    : warned
      ? `\nWorking, with ${warned} warning(s).`
      : '\nEverything looks good: people can reach your profile.',
)
process.exit(failed ? 1 : 0)
