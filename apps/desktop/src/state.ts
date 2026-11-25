/** Everything the window shows; sent from main to renderer on every change. */
export interface AppState {
  phase: 'starting' | 'online' | 'error'
  error?: string
  did?: string
  displayName?: string
  peers: number
  /** Address of the agent API, for pairing websites other than the bundled one. */
  agentUrl?: string
  pairingCode?: string
  autostart: boolean
}

export interface SocialKeyBridge {
  getState(): Promise<AppState>
  onState(listener: (state: AppState) => void): void
  openWeb(): Promise<void>
  copy(text: string): Promise<void>
  setAutostart(enabled: boolean): Promise<void>
  retry(): Promise<void>
}
