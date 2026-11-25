import { existsSync } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import {
  HttpKubo,
  loadConfig,
  loadOrCreateIdentity,
  type RunningAgent,
  replaceIdentity,
  startAgent,
} from '@socialkey/agent'
import { identityFromSecretKey, phraseToSecretKey, secretKeyToPhrase } from '@socialkey/core'
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { isAutostartEnabled, setAutostart } from './autostart'
import { KuboDaemon } from './kubo-daemon'
import { loadSettings, type Settings, saveSettings } from './settings'
import type { AppState } from './state'

const AGENT_PORT = 4040
const KUBO_PORTS = { api: 45001, gateway: 48080 }
const PEER_POLL_MS = 10_000
// Shared with the command-line agent, so both use the same identity.
const DATA_DIR = process.env.SOCIALKEY_DATA_DIR ?? join(homedir(), '.socialkey')

let window: BrowserWindow | null = null
let tray: Tray | null = null
let agent: RunningAgent | null = null
let peerTimer: NodeJS.Timeout | undefined
let quitting = false
let state: AppState = {
  phase: 'starting',
  peers: 0,
  autostart: false,
  hostFollows: true,
  hostedProfiles: 0,
  lanAccess: false,
}
let settings: Settings = { hostFollows: true, lanAccess: false }

const kubo = new KuboDaemon(kuboBinary(), join(DATA_DIR, 'kubo'), KUBO_PORTS)
const webRoot = app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '../../web/dist')

function kuboBinary(): string {
  const name = process.platform === 'win32' ? 'ipfs.exe' : 'ipfs'
  if (app.isPackaged) return join(process.resourcesPath, 'kubo', name)
  // In development, use the binary the `kubo` package downloaded.
  return (require('kubo') as { path(): string }).path()
}

function update(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  window?.webContents.send('state', state)
  refreshTrayMenu()
}

async function startServices(): Promise<void> {
  update({ phase: 'starting', error: undefined })
  try {
    await kubo.start((error) => {
      console.error(error)
      void stopServices().then(() => update({ phase: 'error', error: error.message }))
    })
    agent = await startAgent(
      {
        ...loadConfig({}),
        port: AGENT_PORT,
        kuboApi: kubo.apiUrl,
        kuboGateway: kubo.gatewayUrl,
        dataDir: DATA_DIR,
        webRoot: existsSync(webRoot) ? webRoot : undefined,
        hostFollows: settings.hostFollows,
        lanAccess: settings.lanAccess,
        host: settings.lanAccess ? '0.0.0.0' : '127.0.0.1',
      },
      { onPairingCode: (pairingCode) => update({ pairingCode }) },
    )
    update({
      phase: 'online',
      did: agent.identity.did,
      displayName: agent.publisher.current.manifest.profile.displayName,
      agentUrl: agent.url,
      pairingCode: agent.auth.pairingCode,
      lanUrl: settings.lanAccess ? lanUrl() : undefined,
    })
    peerTimer = setInterval(refreshStatus, PEER_POLL_MS)
    await refreshStatus()
  } catch (err) {
    console.error('SocialKey failed to start:', err)
    await stopServices()
    update({ phase: 'error', error: friendlyError(err) })
  }
}

async function refreshStatus(): Promise<void> {
  if (!agent) return
  const displayName = agent.publisher.current.manifest.profile.displayName
  const peers = await kubo.peerCount().catch(() => state.peers)
  const hostedProfiles = agent.hoster?.status().profiles ?? 0
  if (peers !== state.peers || displayName !== state.displayName || hostedProfiles !== state.hostedProfiles) {
    update({ peers, displayName, hostedProfiles })
  }
}

async function stopServices(): Promise<void> {
  clearInterval(peerTimer)
  await agent?.close().catch(() => {})
  agent = null
  await kubo.stop().catch(() => {})
}

/** This computer's address on the local network, for other devices to connect to. */
function lanUrl(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    const ipv4 = addresses?.find((a) => a.family === 'IPv4' && !a.internal)
    if (ipv4) return `http://${ipv4.address}:${AGENT_PORT}`
  }
  return undefined
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    return `Port ${AGENT_PORT} is already in use. Is another SocialKey agent running? Close it and try again.`
  }
  if (message.includes('repo.lock') || message.includes('lock')) {
    return 'Another copy of the SocialKey IPFS node is still running. Wait a moment and try again.'
  }
  return message
}

/** Opens the web app in the browser, pairing it automatically. */
async function openWeb(): Promise<void> {
  if (!agent) return
  const base = existsSync(webRoot) ? `${agent.url}/app/` : (process.env.SOCIALKEY_WEB_URL ?? 'http://localhost:5173/')
  await shell.openExternal(`${base}#/connect?code=${encodeURIComponent(agent.auth.pairingCode)}`)
}

function showWindow(): void {
  if (window) {
    window.show()
    window.focus()
    return
  }
  window = new BrowserWindow({
    width: 500,
    height: 900,
    minWidth: 380,
    minHeight: 500,
    title: 'SocialKey',
    icon: join(__dirname, 'assets/icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  window.loadFile(join(__dirname, 'renderer/index.html'))
  window.once('ready-to-show', () => window?.show())
  // Closing the window keeps the agent running in the tray.
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    window?.hide()
  })
  window.on('closed', () => {
    window = null
  })
  // Links in the window open in the user's browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createTray(): void {
  // Windows taskbars can be light or dark, so use the full-colour icon there.
  const file = process.platform === 'win32' ? 'tray-win.png' : 'tray.png'
  const icon = nativeImage.createFromPath(join(__dirname, 'assets', file))
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('SocialKey')
  tray.on('click', showWindow)
  refreshTrayMenu()
}

function refreshTrayMenu(): void {
  if (!tray) return
  const status =
    state.phase === 'online'
      ? `Online · ${state.peers} peer${state.peers === 1 ? '' : 's'}`
      : state.phase === 'starting'
        ? 'Starting…'
        : 'Not running'
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `SocialKey: ${status}`, enabled: false },
      { type: 'separator' },
      { label: 'Show SocialKey', click: showWindow },
      { label: 'Open in browser', enabled: state.phase === 'online', click: () => void openWeb() },
      {
        label: 'Copy my ID',
        enabled: state.did !== undefined,
        click: () => state.did && clipboard.writeText(state.did),
      },
      { type: 'separator' },
      {
        label: 'Start when I log in',
        type: 'checkbox',
        checked: state.autostart,
        click: (item) => void changeAutostart(item.checked),
      },
      { type: 'separator' },
      { label: 'Quit SocialKey', click: () => app.quit() },
    ]),
  )
}

async function changeAutostart(enabled: boolean): Promise<void> {
  await setAutostart(enabled)
  update({ autostart: isAutostartEnabled() })
}

ipcMain.handle('get-state', () => state)
ipcMain.handle('open-web', openWeb)
ipcMain.handle('copy', (_event, text: string) => clipboard.writeText(text))
ipcMain.handle('set-autostart', (_event, enabled: boolean) => changeAutostart(enabled))
ipcMain.handle('set-host-follows', async (_event, enabled: boolean) => {
  settings = { ...settings, hostFollows: enabled }
  await saveSettings(DATA_DIR, settings)
  update({ hostFollows: enabled, hostedProfiles: 0 })
  // The agent reads this at startup, so restart it.
  await stopServices()
  await startServices()
})
ipcMain.handle('set-lan-access', async (_event, enabled: boolean) => {
  settings = { ...settings, lanAccess: enabled }
  await saveSettings(DATA_DIR, settings)
  update({ lanAccess: enabled, lanUrl: undefined })
  await stopServices()
  await startServices()
})
ipcMain.handle('get-recovery-phrase', async () =>
  secretKeyToPhrase((await loadOrCreateIdentity(DATA_DIR)).identity.secretKey),
)
ipcMain.handle('restore-account', async (_event, phrase: string): Promise<{ ok: boolean; message: string }> => {
  let secretKey: Uint8Array
  try {
    secretKey = phraseToSecretKey(phrase)
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
  if (identityFromSecretKey(secretKey).did === state.did)
    return { ok: false, message: 'That phrase is for the account already on this computer.' }
  update({ phase: 'starting', did: undefined, displayName: undefined })
  // Kubo must be running to drop its copy of the old key, so stop only the agent first.
  clearInterval(peerTimer)
  await agent?.close().catch(() => {})
  agent = null
  const archive = await replaceIdentity(DATA_DIR, secretKey, new HttpKubo(kubo.apiUrl), loadConfig({}).keyName)
  await stopServices()
  await startServices()
  return { ok: true, message: `Account restored. The previous account's files were kept in ${archive}.` }
})
ipcMain.handle('retry', async () => {
  await stopServices()
  await startServices()
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  // Keep running in the tray after the last window closes.
  app.on('window-all-closed', () => {})
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    void stopServices().finally(() => app.quit())
  })

  // Must match electron-builder's appId so Windows groups the taskbar icon with the shortcut.
  app.setAppUserModelId('org.socialkey.desktop')

  void app.whenReady().then(async () => {
    state.autostart = isAutostartEnabled()
    settings = await loadSettings(DATA_DIR)
    state.hostFollows = settings.hostFollows
    state.lanAccess = settings.lanAccess
    createTray()
    // Launched at login with --hidden: stay in the tray.
    if (!process.argv.includes('--hidden')) showWindow()
    void startServices()
  })
}
