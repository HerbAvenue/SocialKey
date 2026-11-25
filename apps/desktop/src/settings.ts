import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Desktop preferences, kept next to the agent's data. */
export interface Settings {
  hostFollows: boolean
  /** Let phones and other devices on the local network use this app. */
  lanAccess: boolean
}

const DEFAULTS: Settings = { hostFollows: true, lanAccess: false }

export async function loadSettings(dataDir: string): Promise<Settings> {
  try {
    return { ...DEFAULTS, ...(JSON.parse(await readFile(join(dataDir, 'desktop.json'), 'utf8')) as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function saveSettings(dataDir: string, settings: Settings): Promise<void> {
  await writeFile(join(dataDir, 'desktop.json'), JSON.stringify(settings, null, 2))
}
