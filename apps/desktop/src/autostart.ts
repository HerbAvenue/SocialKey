import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

// Electron's login-item API doesn't support Linux, so there we write an XDG autostart entry.
const desktopFile = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'autostart', 'socialkey.desktop')

export function isAutostartEnabled(): boolean {
  if (process.platform === 'linux') return existsSync(desktopFile)
  return app.getLoginItemSettings().openAtLogin
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
    return
  }
  if (!enabled) {
    await rm(desktopFile, { force: true })
    return
  }
  // An AppImage moves its mounted path every run; launch the AppImage file itself.
  const command = [process.env.APPIMAGE ?? process.execPath, ...(app.isPackaged ? [] : [app.getAppPath()]), '--hidden']
  await mkdir(join(desktopFile, '..'), { recursive: true })
  await writeFile(
    desktopFile,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=SocialKey',
      'Comment=Keeps your SocialKey profile online',
      `Exec=${command.map((part) => `"${part}"`).join(' ')}`,
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n'),
  )
}
