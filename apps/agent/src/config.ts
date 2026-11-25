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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    // Never bind beyond loopback: the agent holds the user's private key.
    host: '127.0.0.1',
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
  }
}
