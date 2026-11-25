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
  /** Whether this app helps keep the people you follow online, and how many it hosts. */
  hostFollows: boolean
  hostedProfiles: number
  lanAccess: boolean
  /** Address other devices on the network use, when LAN access is on. */
  lanUrl?: string
}

export interface SocialKeyBridge {
  getState(): Promise<AppState>
  onState(listener: (state: AppState) => void): void
  openWeb(): Promise<void>
  copy(text: string): Promise<void>
  setAutostart(enabled: boolean): Promise<void>
  setHostFollows(enabled: boolean): Promise<void>
  setLanAccess(enabled: boolean): Promise<void>
  getRecoveryPhrase(): Promise<string>
  restoreAccount(phrase: string): Promise<{ ok: boolean; message: string }>
  retry(): Promise<void>
}
