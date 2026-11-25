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
const hostFollows = $<HTMLInputElement>('host-follows')

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
  hostFollows.checked = state.hostFollows
  $('hosting-status').textContent =
    state.hostFollows && state.hostedProfiles > 0
      ? `Keeping ${state.hostedProfiles} ${state.hostedProfiles === 1 ? 'person' : 'people'} you follow online.`
      : 'Uses a little disk space and bandwidth.'
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
hostFollows.addEventListener('change', () => void api.setHostFollows(hostFollows.checked))
let phrase = ''
const phraseBox = $('phrase')
const showPhrase = $<HTMLButtonElement>('show-phrase')
showPhrase.addEventListener('click', async () => {
  if (!phraseBox.hidden) {
    phraseBox.hidden = true
    phraseBox.replaceChildren()
    $('copy-phrase').hidden = true
    showPhrase.textContent = 'Show recovery phrase'
    return
  }
  phrase = await api.getRecoveryPhrase()
  phraseBox.replaceChildren(
    ...phrase.split(' ').map((word, i) => {
      const span = document.createElement('span')
      span.dataset.n = String(i + 1)
      span.textContent = word
      return span
    }),
  )
  phraseBox.hidden = false
  $('copy-phrase').hidden = false
  showPhrase.textContent = 'Hide'
})
copyButton('copy-phrase', () => phrase)

$('restore').addEventListener('click', async () => {
  const input = $<HTMLTextAreaElement>('restore-phrase')
  const result = $('restore-result')
  if (!input.value.trim()) return
  if (!confirm('Replace the account on this computer with the one from this recovery phrase?')) return
  const { ok, message } = await api.restoreAccount(input.value)
  result.hidden = false
  result.textContent = message
  result.style.color = ok ? '' : 'var(--bad)'
  if (ok) input.value = ''
})

copyButton('copy-did', () => current?.did)
copyButton('copy-code', () => current?.pairingCode)
