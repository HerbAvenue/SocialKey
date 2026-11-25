/**
 * Copies text. navigator.clipboard only exists on secure origins, so on the
 * agent opened over the local network (plain http) this falls back to the
 * older select-and-copy approach.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text)
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error("Couldn't copy. Select the text and copy it manually.")
}
