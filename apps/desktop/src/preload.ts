import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, SocialKeyBridge } from './state'

const bridge: SocialKeyBridge = {
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (listener) => {
    ipcRenderer.on('state', (_event, state: AppState) => listener(state))
  },
  openWeb: () => ipcRenderer.invoke('open-web'),
  copy: (text) => ipcRenderer.invoke('copy', text),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  setHostFollows: (enabled) => ipcRenderer.invoke('set-host-follows', enabled),
  setLanAccess: (enabled) => ipcRenderer.invoke('set-lan-access', enabled),
  getRecoveryPhrase: () => ipcRenderer.invoke('get-recovery-phrase'),
  restoreAccount: (phrase) => ipcRenderer.invoke('restore-account', phrase),
  retry: () => ipcRenderer.invoke('retry'),
}

contextBridge.exposeInMainWorld('socialkey', bridge)
