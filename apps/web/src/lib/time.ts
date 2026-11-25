const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' })
const short = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const withYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** "now", "5m", "3h", "Mar 4", "Mar 4, 2025" — like other social apps. */
export function timeAgo(iso: string, now = Date.now()): string {
  const date = new Date(iso)
  const seconds = Math.round((now - date.getTime()) / 1000)
  if (seconds < 45) return 'now'
  if (seconds < 3600) return relative.format(-Math.round(seconds / 60), 'minute').replace(/ ago$/, '')
  if (seconds < 86_400) return relative.format(-Math.round(seconds / 3600), 'hour').replace(/ ago$/, '')
  return (date.getFullYear() === new Date(now).getFullYear() ? short : withYear).format(date)
}

export function fullDate(iso: string): string {
  return full.format(new Date(iso))
}
