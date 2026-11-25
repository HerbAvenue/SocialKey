import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

/**
 * Pairing: the agent shows a one-time code; the frontend trades it for a
 * long-lived bearer token. Only token hashes are stored on disk.
 */
export class Auth {
  private code = ''

  private constructor(
    private readonly file: string,
    private readonly tokenHashes: Set<string>,
    private readonly onCode: (code: string) => void,
  ) {
    this.rotateCode()
  }

  static async load(file: string, onCode: (code: string) => void): Promise<Auth> {
    let hashes: string[] = []
    try {
      hashes = JSON.parse(await readFile(file, 'utf8')) as string[]
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return new Auth(file, new Set(hashes), onCode)
  }

  /** The code that currently pairs a frontend (single-use, rotates after each pairing). */
  get pairingCode(): string {
    return this.code
  }

  /** Returns a new token if `code` matches the current pairing code. */
  async pair(code: string): Promise<string | null> {
    const given = Buffer.from(code.trim().toUpperCase())
    const expected = Buffer.from(this.code)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    this.rotateCode()
    const token = randomBytes(32).toString('base64url')
    this.tokenHashes.add(hash(token))
    await writeFile(this.file, JSON.stringify([...this.tokenHashes]), { mode: 0o600 })
    return token
  }

  isAuthorized(authorization: string | undefined): boolean {
    const token = authorization?.match(/^Bearer (\S+)$/)?.[1]
    return token !== undefined && this.tokenHashes.has(hash(token))
  }

  private rotateCode(): void {
    const bytes = randomBytes(10)
    this.code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
    this.onCode(this.code)
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
