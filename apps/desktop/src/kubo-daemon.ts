import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const READY_TIMEOUT_MS = 60_000

export interface KuboPorts {
  api: number
  gateway: number
}

/**
 * Runs a private Kubo node for the app, with its own repo and ports so it
 * never collides with an IPFS daemon the user may already run.
 */
export class KuboDaemon {
  private proc: ChildProcess | undefined
  private log: string[] = []

  constructor(
    private readonly bin: string,
    private readonly repo: string,
    private readonly ports: KuboPorts,
  ) {}

  get apiUrl(): string {
    return `http://127.0.0.1:${this.ports.api}`
  }

  get gatewayUrl(): string {
    return `http://127.0.0.1:${this.ports.gateway}`
  }

  /** Starts the node. `onExit` fires if it later stops without `stop()` being called. */
  async start(onExit: (error: Error) => void = () => {}): Promise<void> {
    // A leftover node holds the repo lock, which `ipfs config` below also needs.
    await this.shutdownLeftover()
    if (!existsSync(join(this.repo, 'config'))) {
      // `ipfs init` doesn't create missing parent directories.
      await mkdir(this.repo, { recursive: true, mode: 0o700 })
      await this.ipfs('init', '--profile=randomports')
    }
    // Applied on every start so changes to the defaults reach existing repos.
    await this.ipfs('config', 'Addresses.API', `/ip4/127.0.0.1/tcp/${this.ports.api}`)
    await this.ipfs('config', 'Addresses.Gateway', `/ip4/127.0.0.1/tcp/${this.ports.gateway}`)
    // The web app resolves IPNS through the local node's /routing/v1 endpoint.
    await this.ipfs('config', '--json', 'Gateway.ExposeRoutingAPI', 'true')

    this.log = []
    const proc = spawn(this.bin, ['daemon', '--enable-gc'], {
      env: this.env(),
      stdio: ['ignore', 'pipe', 'pipe'],
      // Without this, Windows opens a console window for the daemon.
      windowsHide: true,
    })
    this.proc = proc
    const keep = (chunk: Buffer) => {
      this.log.push(...chunk.toString().split('\n').filter(Boolean))
      this.log = this.log.slice(-20)
    }
    proc.stdout?.on('data', keep)
    proc.stderr?.on('data', keep)

    let ready = false
    const exited = new Promise<never>((_, reject) =>
      proc.once('exit', (code, signal) => {
        const error = new Error(`IPFS node exited (${signal ?? `code ${code}`}):\n${this.log.join('\n')}`)
        if (!ready) reject(error)
        else if (this.proc === proc) onExit(error)
        if (this.proc === proc) this.proc = undefined
      }),
    )
    await Promise.race([this.waitUntilReady(), exited])
    ready = true
  }

  async stop(): Promise<void> {
    const proc = this.proc
    this.proc = undefined
    if (!proc || proc.exitCode !== null) return
    const done = new Promise((resolve) => proc.once('exit', resolve))
    // Ask over the API first: on Windows, kill() terminates immediately, with no clean shutdown.
    await fetch(`${this.apiUrl}/api/v0/shutdown`, { method: 'POST' }).catch(() => proc.kill('SIGTERM'))
    const timeout = setTimeout(() => proc.kill('SIGKILL'), 10_000)
    await done
    clearTimeout(timeout)
  }

  async peerCount(): Promise<number> {
    const res = await fetch(`${this.apiUrl}/api/v0/swarm/peers`, { method: 'POST' })
    const body = (await res.json()) as { Peers: unknown[] | null }
    return body.Peers?.length ?? 0
  }

  /**
   * A node still answering on our private API port was left behind by a crashed
   * run (it holds the repo lock), so ask it to shut down before starting ours.
   */
  private async shutdownLeftover(): Promise<void> {
    if (!(await this.isUp())) return
    await fetch(`${this.apiUrl}/api/v0/shutdown`, { method: 'POST' }).catch(() => {})
    const deadline = Date.now() + 15_000
    while ((await this.isUp()) && Date.now() < deadline) await delay(250)
  }

  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await this.isUp()) return
      await delay(250)
    }
    throw new Error(`IPFS node did not start within ${READY_TIMEOUT_MS / 1000}s:\n${this.log.join('\n')}`)
  }

  private async isUp(): Promise<boolean> {
    try {
      return (await fetch(`${this.apiUrl}/api/v0/id`, { method: 'POST' })).ok
    } catch {
      return false
    }
  }

  private ipfs(...args: string[]) {
    return run(this.bin, args, { env: this.env(), windowsHide: true })
  }

  private env(): NodeJS.ProcessEnv {
    return { ...process.env, IPFS_PATH: this.repo }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
