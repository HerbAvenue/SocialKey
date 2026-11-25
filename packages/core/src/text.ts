/** A piece of post text, for rendering links, hashtags and mentions. */
export type TextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'url'; text: string; href: string }
  | { kind: 'hashtag'; text: string; tag: string }
  | { kind: 'mention'; text: string; name: string }

// URLs, #hashtags and @mentions. Mentions match a display name or handle up to
// the next space; the post's `mentions` list says which people were meant.
const TOKEN = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])|(^|\s)(#[\p{L}\p{N}_]{1,64})|(^|\s)(@[\p{L}\p{N}_.-]{1,64})/gu

export function segmentText(text: string): TextSegment[] {
  const out: TextSegment[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const [whole, url, tagLead = '', tag, mentionLead = '', mention] = match
    const lead = url ? '' : tag ? tagLead : mentionLead
    const start = (match.index ?? 0) + lead.length
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) })
    if (url) out.push({ kind: 'url', text: url, href: url })
    else if (tag) out.push({ kind: 'hashtag', text: tag, tag: tag.slice(1).toLowerCase() })
    else if (mention) out.push({ kind: 'mention', text: mention, name: mention.slice(1) })
    last = (match.index ?? 0) + whole.length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

export function hashtags(text: string): string[] {
  return [...new Set(segmentText(text).flatMap((s) => (s.kind === 'hashtag' ? [s.tag] : [])))]
}
