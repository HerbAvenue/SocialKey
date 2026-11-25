import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Identity } from '@socialkey/core'
import { Auth } from './auth'
import type { Config } from './config'
import { Hoster } from './hoster'
import { ensureKuboKey, loadOrCreateIdentity } from './keystore'
import { HttpKubo } from './kubo'
import { Moderation } from './moderation'
import { Publisher } from './publisher'
import { buildServer } from './server'

export interface RunningAgent {
  identity: Identity
  /** True when this run generated a brand-new identity. */
  created: boolean
  publisher: Publisher
  auth: Auth
  /** Present when `config.hostFollows` is on. */
  hoster?: Hoster
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

  const publisher = new Publisher({
    kubo,
    identity,
    keyName: config.keyName,
    stateFile: join(config.dataDir, 'manifest.dagjson'),
    log: logger ? (message) => console.warn(message) : undefined,
  })
  // An existing key without saved state means a restore or reinstall: look for the profile online first.
  await publisher.init('Anonymous', { recover: !created })

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
  const app = await buildServer({ config, publisher, auth, hoster, moderation, logger })
  await app.listen({ host: config.host, port: config.port })

  return {
    identity,
    created,
    publisher,
    auth,
    hoster,
    url: `http://${config.host}:${config.port}`,
    close: async () => {
      hoster?.stop()
      publisher.close()
      await app.close()
    },
  }
}
