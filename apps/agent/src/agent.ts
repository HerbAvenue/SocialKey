import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Identity } from '@socialkey/core'
import { Auth } from './auth'
import type { Config } from './config'
import { Hoster } from './hoster'
import { ensureKuboKey, loadOrCreateIdentity } from './keystore'
import { HttpKubo } from './kubo'
import { Live } from './live'
import { Moderation } from './moderation'
import { Publisher } from './publisher'
import { buildServer } from './server'
import { Warmer } from './warmer'

export interface RunningAgent {
  identity: Identity
  /** True when this run generated a brand-new identity. */
  created: boolean
  publisher: Publisher
  auth: Auth
  /** Present when `config.hostFollows` is on. */
  hoster?: Hoster
  /** PubSub listener with the newest verified manifests of people you follow. */
  live: Live
  /** Base URL of the HTTP API, e.g. http://127.0.0.1:4040 */
  url: string
  close(): Promise<void>
}

/** Loads the identity, connects it to Kubo, and starts the HTTP API. */
export async function startAgent(
  config: Config,
  { logger = false, onPairingCode = () => {} }: { logger?: boolean; onPairingCode?: (code: string) => void } = {},
): Promise<RunningAgent> {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 })

  const kubo = new HttpKubo(config.kuboApi, config.kuboGateway)
  const { identity, created } = await loadOrCreateIdentity(config.dataDir)
  await ensureKuboKey(kubo, config.keyName, identity)

  const log = logger ? (message: string) => console.warn(message) : undefined
  const warmer = config.warmGateways ? new Warmer({ log }) : undefined
  const live = new Live(kubo, log)
  const publisher: Publisher = new Publisher({
    kubo,
    identity,
    keyName: config.keyName,
    stateFile: join(config.dataDir, 'manifest.dagjson'),
    log,
    onCommitted: (cid) => void live.announce(identity.ipnsName, cid),
    onPublished: (cid, manifest) => warmer?.warm(identity.ipnsName, cid, manifest, (post) => publisher.mediaOf(post)),
  })
  // An existing key without saved state means a restore or reinstall: look for the profile online first.
  await publisher.init('Anonymous', { recover: !created })

  // Follow PubSub updates from everyone you follow, adjusting as that list changes.
  live.start()
  live.follow(publisher.current.manifest.follows)
  void live.announce(identity.ipnsName, publisher.current.cid)
  const followSync = setInterval(() => live.follow(publisher.current.manifest.follows), 5_000)

  const hoster = config.hostFollows
    ? new Hoster({
        kubo,
        follows: () => publisher.current.manifest.follows,
        stateFile: join(config.dataDir, 'hosted.json'),
        log: logger ? (message) => console.warn(message) : undefined,
      })
    : undefined
  await hoster?.start()

  const auth = await Auth.load(join(config.dataDir, 'tokens.json'), onPairingCode)
  const moderation = await Moderation.load(join(config.dataDir, 'moderation.json'))
  const app = await buildServer({ config, publisher, auth, hoster, moderation, live, logger })
  await app.listen({ host: config.host, port: config.port })

  return {
    identity,
    created,
    publisher,
    auth,
    hoster,
    live,
    url: `http://${config.host}:${config.port}`,
    close: async () => {
      clearInterval(followSync)
      live.stop()
      hoster?.stop()
      publisher.close()
      await app.close()
    },
  }
}
