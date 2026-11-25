import { readFile, rename, writeFile } from 'node:fs/promises'
import { CID, didToIpnsName, readManifest, readPost } from '@socialkey/core'
import type { Kubo } from './kubo'

// Per followed profile: the manifest, its newest posts, and their images.
const POSTS_PER_PROFILE = 20
const MEDIA_PER_PROFILE = 20
const MAX_PROFILES = 200

interface HostedProfile {
  manifest: string
  /** Pinned CIDs as `direct:<cid>` or `recursive:<cid>`, so they can be unpinned the same way. */
  pins: string[]
  hostedAt: string
}

export interface HostingStatus {
  enabled: boolean
  profiles: number
  lastRun?: string
}

interface Deps {
  kubo: Kubo
  /** Who to host: the people you follow. */
  follows: () => string[]
  stateFile: string
  intervalMs?: number
  now?: () => Date
  log?: (message: string) => void
}

/**
 * Keeps the people you follow online while their own computers are off: it
 * pins their latest manifest, recent posts and images, and re-announces their
 * signed IPNS record (which anyone can do; only the owner can create one). If
 * every follower does this, a profile stays reachable as long as anyone who
 * follows it is online.
 */
export class Hoster {
  private state: Record<string, HostedProfile> = {}
  private timer: NodeJS.Timeout | undefined
  private running: Promise<void> | undefined
  private lastRun: string | undefined

  constructor(private readonly deps: Deps) {}

  async start(): Promise<void> {
    this.state = await readState(this.deps.stateFile)
    void this.runOnce()
    this.timer = setInterval(() => void this.runOnce(), this.deps.intervalMs ?? 30 * 60_000)
  }

  stop(): void {
    clearInterval(this.timer)
  }

  status(): HostingStatus {
    return { enabled: this.timer !== undefined, profiles: Object.keys(this.state).length, lastRun: this.lastRun }
  }

  /** One pass over everyone you follow. Overlapping calls share the pass in progress. */
  runOnce(): Promise<void> {
    this.running ??= this.cycle().finally(() => {
      this.running = undefined
    })
    return this.running
  }

  private async cycle(): Promise<void> {
    const follows = new Set(this.deps.follows().slice(0, MAX_PROFILES))
    for (const did of Object.keys(this.state)) {
      if (!follows.has(did)) {
        await this.unpinAll(this.state[did]?.pins ?? [])
        delete this.state[did]
      }
    }
    for (const did of follows) {
      try {
        await this.host(did)
      } catch (err) {
        this.deps.log?.(`Couldn't host ${did}: ${err instanceof Error ? err.message : err}`)
      }
    }
    this.lastRun = (this.deps.now?.() ?? new Date()).toISOString()
    await writeState(this.deps.stateFile, this.state)
  }

  private async host(did: string): Promise<void> {
    const { kubo } = this.deps
    const name = didToIpnsName(did)
    const record = await kubo.getIpnsRecord(name)
    const manifestCid = await kubo.resolveName(name)
    const previous = this.state[did]

    if (previous?.manifest !== manifestCid.toString()) {
      const manifest = readManifest(await kubo.getBlock(manifestCid))
      if (manifest.author !== did) throw new Error(`Manifest is signed by ${manifest.author}`)

      const pins = new Set<string>([`direct:${manifestCid}`])
      const media: CID[] = [manifest.profile.avatar, manifest.profile.banner].filter((c) => c !== undefined)
      for (const post of manifest.posts.slice(0, POSTS_PER_PROFILE)) {
        pins.add(`direct:${post}`)
        try {
          media.push(...readPost(await kubo.getBlock(post)).media)
        } catch {
          // An unreadable post is still worth pinning; it just has no media to add.
        }
      }
      for (const cid of media.slice(0, MEDIA_PER_PROFILE)) pins.add(`recursive:${cid}`)

      // Only pins this created are ours to remove later; anything already pinned belongs to someone else.
      const created = new Set<string>()
      for (const pin of pins) {
        const [mode, cid] = pin.split(':') as [string, string]
        const ours = previous?.pins.includes(pin) || (await kubo.pin(CID.parse(cid), mode === 'recursive'))
        if (ours) created.add(pin)
      }
      await this.unpinAll((previous?.pins ?? []).filter((p) => !created.has(p)))
      this.state[did] = { manifest: manifestCid.toString(), pins: [...created], hostedAt: '' }
    }
    await kubo.putIpnsRecord(name, record)
    const hosted = this.state[did]
    if (hosted) hosted.hostedAt = (this.deps.now?.() ?? new Date()).toISOString()
  }

  private async unpinAll(pins: string[]): Promise<void> {
    for (const pin of pins) {
      await this.deps.kubo.unpin(CID.parse(pin.slice(pin.indexOf(':') + 1))).catch(() => {})
    }
  }
}

async function readState(file: string): Promise<Record<string, HostedProfile>> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, HostedProfile>
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

async function writeState(file: string, state: Record<string, HostedProfile>): Promise<void> {
  await writeFile(`${file}.tmp`, JSON.stringify(state, null, 2))
  await rename(`${file}.tmp`, file)
}
