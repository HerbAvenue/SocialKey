import { homedir } from 'node:os'
import { join } from 'node:path'

export interface Config {
  host: string
  port: number
  kuboApi: string
  /** Kubo gateway the frontend can use as a fast, local trustless gateway. */
  kuboGateway: string
  dataDir: string
  keyName: string
  allowedOrigins: string[]
  /** Built web app to serve at /app/, if any. */
  webRoot?: string
  /** Help keep the people you follow online by hosting their recent posts. */
  hostFollows: boolean
  /** Accept connections from other devices on the local network (e.g. your phone), not just this computer. */
  lanAccess: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    // Loopback only unless the user opts in: the agent holds their private key.
    // Even then every API call needs a token obtained with a one-time pairing code.
    host: env.SOCIALKEY_LAN === 'true' ? '0.0.0.0' : '127.0.0.1',
    port: Number(env.SOCIALKEY_PORT ?? 4040),
    kuboApi: env.KUBO_API ?? 'http://127.0.0.1:5001',
    kuboGateway: env.KUBO_GATEWAY ?? 'http://127.0.0.1:8080',
    dataDir: env.SOCIALKEY_DATA_DIR ?? join(homedir(), '.socialkey'),
    keyName: env.SOCIALKEY_KEY_NAME ?? 'socialkey',
    allowedOrigins: (env.SOCIALKEY_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    webRoot: env.SOCIALKEY_WEB_ROOT,
    hostFollows: env.SOCIALKEY_HOST_FOLLOWS !== 'false',
    lanAccess: env.SOCIALKEY_LAN === 'true',
  }
}
