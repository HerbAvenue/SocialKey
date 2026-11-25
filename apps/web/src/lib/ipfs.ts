import { createVerifiedFetch, type VerifiedFetch } from '@helia/verified-fetch'
import {
  CID,
  cidOf,
  didToIpnsName,
  type Manifest,
  type Post,
  type PostPage,
  readManifest,
  readPost,
  readPostPage,
} from '@socialkey/core'
import { GATEWAYS, ROUTERS } from './config'

const RAW = 'application/vnd.ipld.raw'
// Without these, a fetch nobody can serve (e.g. an offline profile) would load forever.
const FETCH_TIMEOUT_MS = 30_000
// Resolving someone else's IPNS name goes through the DHT and can take a while.
const IPNS_TIMEOUT_MS = 60_000

let verifiedFetch: Promise<VerifiedFetch> | null = null
let localGateway: string | null = null

/**
 * The paired agent's Kubo gateway. When set, everything is fetched from it
 * directly: browsers can't dial the TCP/QUIC addresses that routers return for
 * home nodes, so verified-fetch can't reach that content on its own.
 */
export function setLocalGateway(gateway: string | null): void {
  localGateway = gateway
}

/** Used only when no agent is paired: public trustless gateways and delegated routing. */
function getVerifiedFetch(): Promise<VerifiedFetch> {
  verifiedFetch ??= createVerifiedFetch({ gateways: GATEWAYS, routers: ROUTERS })
  return verifiedFetch
}

function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function describeFailure(path: string, err: unknown): Error {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new Error(`Timed out fetching ${path}: no reachable node has it right now.`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

/** Fetches one raw block by `/ipfs/<cid>` or `/ipns/<name>` path. */
async function fetchBlock(path: string, signal?: AbortSignal): Promise<Uint8Array> {
  const [, namespace = '', id = ''] = path.split('/')
  const ms = namespace === 'ipns' ? IPNS_TIMEOUT_MS : FETCH_TIMEOUT_MS
  try {
    if (!localGateway) {
      const vf = await getVerifiedFetch()
      const res = await vf(`${namespace}://${id}`, { headers: { accept: RAW }, signal: withTimeout(ms, signal) })
      if (!res.ok) throw new Error(`Fetching ${path} failed (${res.status})`)
      return new Uint8Array(await res.arrayBuffer())
    }
    const res = await fetch(`${localGateway}${path}`, { headers: { accept: RAW }, signal: withTimeout(ms, signal) })
    if (!res.ok) throw new Error(`Fetching ${path} failed (${res.status})`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    // Our objects are single dag-json blocks, so checking the CID is just hashing the bytes.
    // An /ipns/ response can't be checked against the name here, but manifests are
    // signature-checked against their author's did:key by the caller.
    if (namespace === 'ipfs' && !(await cidOf(bytes)).equals(CID.parse(id))) {
      throw new Error(`Gateway returned the wrong data for ${id}`)
    }
    return bytes
  } catch (err) {
    throw describeFailure(path, err)
  }
}

/**
 * Loads a user's latest manifest. Pass `cid` to skip IPNS resolution (e.g. for
 * your own profile, whose freshest CID the agent knows).
 */
export async function loadManifest(did: string, cid?: string, signal?: AbortSignal): Promise<Manifest> {
  const path = cid ? `/ipfs/${cid}` : `/ipns/${didToIpnsName(did)}`
  const manifest = readManifest(await fetchBlock(path, signal))
  if (manifest.author !== did) throw new Error(`Manifest is signed by ${manifest.author}, expected ${did}`)
  return manifest
}

export async function loadPost(cid: CID | string, signal?: AbortSignal): Promise<Post> {
  return readPost(await fetchBlock(`/ipfs/${cid}`, signal))
}

export async function loadPostPage(cid: CID | string, signal?: AbortSignal): Promise<PostPage> {
  return readPostPage(await fetchBlock(`/ipfs/${cid}`, signal))
}

/** A URL for a media file (UnixFS). */
export async function loadMediaUrl(cid: CID | string, signal?: AbortSignal): Promise<string> {
  // The local node serves (and verifies) files itself.
  if (localGateway) return `${localGateway}/ipfs/${cid}`
  const vf = await getVerifiedFetch()
  try {
    const res = await vf(`ipfs://${cid}`, { signal: withTimeout(FETCH_TIMEOUT_MS, signal) })
    if (!res.ok) throw new Error(`Fetching media ${cid} failed (${res.status})`)
    return URL.createObjectURL(await res.blob())
  } catch (err) {
    throw describeFailure(`/ipfs/${cid}`, err)
  }
}
