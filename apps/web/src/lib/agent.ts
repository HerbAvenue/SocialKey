import { AGENT_URL } from './config'

const TOKEN_KEY = 'socialkey.agentToken'

export interface Me {
  did: string
  ipnsName: string
  manifestCid: string
  gateway: string
}

export interface ProfileInput {
  displayName?: string
  bio?: string | null
  avatar?: string | null
  website?: string | null
  location?: string | null
}

export class AgentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable (private mode): pairing lasts for this page load only.
  }
}

async function request<T>(method: string, path: string, body?: unknown, contentType?: string): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = contentType ?? 'application/json'
  const res = await fetch(`${AGENT_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : contentType ? (body as BodyInit) : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) setToken(null)
  if (!res.ok) throw new AgentError(data.error ?? `Agent request failed (${res.status})`, res.status)
  return data as T
}

export const agent = {
  async pair(code: string): Promise<void> {
    const { token } = await request<{ token: string }>('POST', '/pair', { code })
    setToken(token)
  },
  unpair: () => setToken(null),
  me: () => request<Me>('GET', '/me'),
  createPost: (text: string, media: string[] = []) =>
    request<{ cid: string; manifestCid: string }>('POST', '/posts', { text, media }),
  uploadMedia: (file: File) =>
    request<{ cid: string }>('POST', '/media', file, file.type || 'application/octet-stream'),
  updateProfile: (input: ProfileInput) => request<{ manifestCid: string }>('PUT', '/profile', input),
  follow: (did: string) => request<{ manifestCid: string }>('POST', '/follows', { did }),
  unfollow: (did: string) => request<{ manifestCid: string }>('DELETE', `/follows/${encodeURIComponent(did)}`),
}
