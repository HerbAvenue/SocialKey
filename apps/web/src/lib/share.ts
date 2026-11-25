/**
 * Links to share. They point at the public site (VITE_PUBLIC_URL) when one is
 * configured, since the local copy at 127.0.0.1 only works on your computer.
 */
const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL?.replace(/\/?$/, '/')

function base(): string {
  return PUBLIC_URL ?? `${location.origin}${location.pathname}`
}

export function profileLink(didOrHandle: string): string {
  return `${base()}#/u/${didOrHandle}`
}

export function postLink(cid: string): string {
  return `${base()}#/p/${cid}`
}

export const DOWNLOAD_URL: string | undefined = import.meta.env.VITE_DOWNLOAD_URL
