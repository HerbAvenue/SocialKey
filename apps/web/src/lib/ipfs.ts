import {
  blockMatches,
  CID,
  didToIpnsName,
  type Manifest,
  type Message,
  type MessagePage,
  type Post,
  type PostPage,
  readManifest,
  readMessage,
  readMessagePage,
  readPost,
  readPostPage,
  verifyIpnsRecord,
} from '@socialkey/core'
import { GATEWAYS, MEDIA_GATEWAYS, ROUTERS } from './config'

const RAW = 'application/vnd.ipld.raw'
const IPNS_RECORD = 'application/vnd.ipfs.ipns-record'
// Without these, a fetch nobody can serve (e.g. an offline profile) would load forever.
const FETCH_TIMEOUT_MS = 30_000
// Resolving someone else's IPNS name goes through the DHT and can take a while.
const IPNS_TIMEOUT_MS = 60_000

let localGateway: string | null = null

/**
 * The paired agent's Kubo gateway. When set, everything is fetched from it;
 * otherwise from public trustless gateways. Either way every block is checked
 * against its CID and every manifest against its author's signature, so no
 * gateway has to be trusted.
 */
export function setLocalGateway(gateway: string | null): void {
  localGateway = gateway
}

function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function describeFailure(path: string, err: unknown): Error {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new Error(`Timed out fetching ${path}: no reachable node has it right now.`)
  }
  if (err instanceof AggregateError) return new Error(`Couldn't fetch ${path} from any gateway.`)
  return err instanceof Error ? err : new Error(String(err))
}

async function get(url: string, accept: string, signal: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { accept }, signal })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** A raw block, from the local gateway or the first public gateway that has it, checked against its CID. */
async function fetchVerifiedBlock(cid: CID, signal: AbortSignal): Promise<Uint8Array> {
  const sources = localGateway ? [localGateway] : GATEWAYS
  return Promise.any(
    sources.map(async (gateway) => {
      const bytes = await get(`${gateway}/ipfs/${cid}?format=raw`, RAW, signal)
      if (!(await blockMatches(cid, bytes))) throw new Error(`${gateway} returned the wrong data for ${cid}`)
      return bytes
    }),
  )
}

/** Where an IPNS name points, from a signed record checked against the name's own key. */
async function resolveIpns(name: string, signal: AbortSignal): Promise<CID> {
  const urls = localGateway
    ? [`${localGateway}/routing/v1/ipns/${name}`, `${localGateway}/ipns/${name}?format=ipns-record`]
    : [
        // The unique query skips CDN caches: a copy cached from a non-browser request has no CORS
        // headers, so browsers reject it. Records are signature-checked, so only freshness is at stake.
        ...ROUTERS.map((r) => `${r}/routing/v1/ipns/${name}?nocache=${Math.random().toString(36).slice(2)}`),
        ...GATEWAYS.map((g) => `${g}/ipns/${name}?format=ipns-record`),
      ]
  return Promise.any(urls.map(async (url) => verifyIpnsRecord(name, await get(url, IPNS_RECORD, signal)).cid))
}

/** Fetches one raw block by `/ipfs/<cid>` or `/ipns/<name>` path. */
async function fetchBlock(path: string, signal?: AbortSignal): Promise<Uint8Array> {
  const [, namespace = '', id = ''] = path.split('/')
  const ms = namespace === 'ipns' ? IPNS_TIMEOUT_MS : FETCH_TIMEOUT_MS
  const combined = withTimeout(ms, signal)
  try {
    const cid = namespace === 'ipns' ? await resolveIpns(id, combined) : CID.parse(id)
    return await fetchVerifiedBlock(cid, combined)
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

export async function loadMessagePage(cid: CID | string, signal?: AbortSignal): Promise<MessagePage> {
  return readMessagePage(await fetchBlock(`/ipfs/${cid}`, signal))
}

export async function loadMessage(cid: CID | string, signal?: AbortSignal): Promise<Message> {
  return readMessage(await fetchBlock(`/ipfs/${cid}`, signal))
}

/**
 * Candidate URLs for a media file (UnixFS), best first. Images are served by a gateway rather than
 * hash-checked here: an <img> can't run code, and files can span many blocks.
 */
export function mediaUrls(cid: CID | string): string[] {
  if (localGateway) return [`${localGateway}/ipfs/${cid}`]
  const v1 = CID.parse(cid.toString()).toV1().toString()
  return MEDIA_GATEWAYS.map((template) => template.replace('{cid}', v1))
}
