import type { AppState, SocialKeyBridge } from '../state'

declare global {
  interface Window {
    socialkey: SocialKeyBridge
  }
}

const api = window.socialkey
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const statusEl = $('status')
const autostart = $<HTMLInputElement>('autostart')

function render(state: AppState): void {
  const online = state.phase === 'online'
  statusEl.className = `status ${state.phase}`
  $('status-text').textContent = online
    ? `Online · ${state.peers} peer${state.peers === 1 ? '' : 's'}`
    : state.phase === 'starting'
      ? 'Starting…'
      : 'Not running'

  $('error').hidden = state.phase !== 'error'
  $('error-text').textContent = state.error ?? ''

  $<HTMLButtonElement>('open-web').disabled = !online
  $('greeting').textContent = state.displayName ? `Hi, ${state.displayName}` : 'Your profile'
  $('did').textContent = state.did ?? '…'
  $<HTMLButtonElement>('copy-did').disabled = !state.did
  $('pairing-code').textContent = state.pairingCode ?? '…'
  $<HTMLButtonElement>('copy-code').disabled = !state.pairingCode
  $('agent-url').textContent = state.agentUrl ?? '…'
  autostart.checked = state.autostart
}

function copyButton(id: string, text: () => string | undefined): void {
  const button = $<HTMLButtonElement>(id)
  button.addEventListener('click', async () => {
    const value = text()
    if (!value) return
    await api.copy(value)
    button.textContent = 'Copied'
    setTimeout(() => {
      button.textContent = 'Copy'
    }, 1500)
  })
}

let current: AppState | undefined
api.onState((state) => {
  current = state
  render(state)
})
void api.getState().then((state) => {
  current ??= state
  render(current)
})

$('open-web').addEventListener('click', () => void api.openWeb())
$('retry').addEventListener('click', () => void api.retry())
autostart.addEventListener('change', () => void api.setAutostart(autostart.checked))
copyButton('copy-did', () => current?.did)
copyButton('copy-code', () => current?.pairingCode)
