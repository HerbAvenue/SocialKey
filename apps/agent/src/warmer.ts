import type { CID, Manifest } from '@socialkey/core'

const DEFAULT_GATEWAYS = ['https://gateway.pinata.cloud', 'https://trustless-gateway.link', 'https://dweb.link']
const DEFAULT_ROUTERS = ['https://delegated-ipfs.dev']
const POSTS_TO_WARM = 5
const TIMEOUT_MS = 120_000

/**
 * Asks public gateways for your newly published profile and posts, so they
 * fetch them from your node now and serve them from cache later. Without this,
 * a visitor's first load waits while a gateway tracks down a home computer
 * behind a router, which takes tens of seconds.
 */
export class Warmer {
  private warmed = new Set<string>()

  constructor(
    private readonly options: { gateways?: string[]; routers?: string[]; log?: (message: string) => void } = {},
  ) {}

  /** Fire-and-forget: warms the manifest, its newest posts, their images, and the IPNS record. */
  warm(ipnsName: string, manifestCid: CID, manifest: Manifest, mediaFor: (post: CID) => Promise<CID[]>): void {
    void this.warmNow(ipnsName, manifestCid, manifest, mediaFor).catch((err) =>
      this.options.log?.(`Warming gateways failed: ${err instanceof Error ? err.message : err}`),
    )
  }

  /** Like `warm`, but resolves once every request has finished. */
  async warmNow(
    ipnsName: string,
    manifestCid: CID,
    manifest: Manifest,
    mediaFor: (post: CID) => Promise<CID[]>,
  ): Promise<void> {
    const gateways = this.options.gateways ?? DEFAULT_GATEWAYS
    const routers = this.options.routers ?? DEFAULT_ROUTERS
    const posts = manifest.posts.slice(0, POSTS_TO_WARM)
    const media = [manifest.profile.avatar, manifest.profile.banner, ...(await Promise.all(posts.map(mediaFor))).flat()]
    // Already-warmed blocks are immutable, so only new ones need fetching.
    const blocks = [manifestCid, ...posts].filter((cid) => !this.warmed.has(cid.toString()))
    const files = media.filter((cid): cid is CID => cid !== undefined && !this.warmed.has(cid.toString()))
    const requests = [
      ...routers.map((r) =>
        this.get(`${r}/routing/v1/ipns/${ipnsName}?nocache=${Date.now()}`, 'application/vnd.ipfs.ipns-record'),
      ),
      ...blocks.flatMap((cid) =>
        gateways.map((g) => this.get(`${g}/ipfs/${cid}?format=raw`, 'application/vnd.ipld.raw', cid)),
      ),
      ...files.flatMap((cid) => gateways.map((g) => this.get(`${g}/ipfs/${cid}`, '*/*', cid))),
    ]
    await Promise.allSettled(requests)
  }

  private async get(url: string, accept: string, cid?: CID): Promise<void> {
    const res = await fetch(url, { headers: { accept }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    await res.arrayBuffer()
    if (res.ok && cid) this.warmed.add(cid.toString())
  }
}
