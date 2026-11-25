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
  retry: () => ipcRenderer.invoke('retry'),
}

contextBridge.exposeInMainWorld('socialkey', bridge)
