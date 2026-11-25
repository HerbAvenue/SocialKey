import { CID, didToIpnsName, readManifest } from '@socialkey/core'
import type { Kubo } from './kubo'

const REANNOUNCE_MS = 60_000
const RESUBSCRIBE_MS = 30_000

export function liveTopic(ipnsName: string): string {
  return `socialkey/v1/${ipnsName}`
}

interface Known {
  cid: CID
  updatedAt: string
}

/**
 * Near-real-time updates. When you change your profile, the agent announces
 * the new manifest CID on a PubSub topic named after your IPNS name, and every
 * follower's agent subscribed to it hears within seconds, instead of waiting
 * minutes for IPNS to propagate through the DHT. Announcements aren't trusted:
 * the listener fetches the manifest, checks its signature and author, and only
 * accepts versions newer than what it already has.
 */
export class Live {
  private known = new Map<string, Known>()
  private subscriptions = new Map<string, AbortController>()
  private announced: { ipnsName: string; cid: CID } | undefined
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly kubo: Kubo,
    private readonly log?: (message: string) => void,
  ) {}

  start(): void {
    // Re-announce now and then: PubSub only reaches peers already subscribed when a message is sent.
    this.timer = setInterval(() => {
      if (this.announced) void this.announce(this.announced.ipnsName, this.announced.cid)
    }, REANNOUNCE_MS)
  }

  stop(): void {
    clearInterval(this.timer)
    for (const controller of this.subscriptions.values()) controller.abort()
    this.subscriptions.clear()
  }

  async announce(ipnsName: string, cid: CID): Promise<void> {
    this.announced = { ipnsName, cid }
    try {
      await this.kubo.pubsubPublish(liveTopic(ipnsName), new TextEncoder().encode(cid.toString()))
    } catch (err) {
      this.log?.(`PubSub announce failed (is Pubsub.Enabled set in Kubo?): ${err instanceof Error ? err.message : err}`)
    }
  }

  /** Listens to exactly these people. */
  follow(dids: string[]): void {
    const wanted = new Set(dids)
    for (const [did, controller] of this.subscriptions) {
      if (!wanted.has(did)) {
        controller.abort()
        this.subscriptions.delete(did)
        this.known.delete(did)
      }
    }
    for (const did of wanted) if (!this.subscriptions.has(did)) this.subscribe(did)
  }

  /** The newest verified manifest CID heard for each followed person. */
  latest(): Record<string, string> {
    return Object.fromEntries([...this.known].map(([did, k]) => [did, k.cid.toString()]))
  }

  /** Handles one announcement; exposed for tests. Resolves true if it was accepted. */
  async receive(did: string, data: Uint8Array): Promise<boolean> {
    let cid: CID
    try {
      cid = CID.parse(new TextDecoder().decode(data).trim())
    } catch {
      return false
    }
    const current = this.known.get(did)
    if (current?.cid.equals(cid)) return false
    try {
      const manifest = readManifest(await this.kubo.getBlock(cid))
      if (manifest.author !== did) return false
      if (current && manifest.updatedAt <= current.updatedAt) return false
      this.known.set(did, { cid, updatedAt: manifest.updatedAt })
      return true
    } catch {
      return false
    }
  }

  private subscribe(did: string): void {
    const controller = new AbortController()
    this.subscriptions.set(did, controller)
    const topic = liveTopic(didToIpnsName(did))
    const run = async (): Promise<void> => {
      while (!controller.signal.aborted) {
        try {
          await this.kubo.pubsubSubscribe(topic, (data) => void this.receive(did, data), controller.signal)
        } catch (err) {
          if (controller.signal.aborted) return
          this.log?.(`PubSub subscription to ${did} failed: ${err instanceof Error ? err.message : err}`)
        }
        if (!controller.signal.aborted) await new Promise((resolve) => setTimeout(resolve, RESUBSCRIBE_MS))
      }
    }
    void run()
  }
}
