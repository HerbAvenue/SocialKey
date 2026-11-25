import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateSecretKey, type Identity, identityFromSecretKey } from '@socialkey/core'
import type { Kubo } from './kubo'

interface KeyFile {
  secretKey: string
}

/** Loads the user's Ed25519 key from the data dir, creating one on first run. */
export async function loadOrCreateIdentity(dataDir: string): Promise<{ identity: Identity; created: boolean }> {
  const file = join(dataDir, 'key.json')
  try {
    const { secretKey } = JSON.parse(await readFile(file, 'utf8')) as KeyFile
    return { identity: identityFromSecretKey(Buffer.from(secretKey, 'base64')), created: false }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  const secretKey = generateSecretKey()
  const keyFile: KeyFile = { secretKey: Buffer.from(secretKey).toString('base64') }
  await writeFile(file, JSON.stringify(keyFile), { mode: 0o600, flag: 'wx' })
  return { identity: identityFromSecretKey(secretKey), created: true }
}

/** Files that belong to one identity; restoring another moves them aside. */
const IDENTITY_FILES = ['key.json', 'manifest.dagjson', 'tokens.json', 'hosted.json']

/**
 * Switches the data dir to another identity (from a recovery phrase). The
 * current identity's files are moved to `archive-<time>/`, never deleted, and
 * Kubo's copy of the old key is removed so the new one can take its name.
 * Returns the archive directory.
 */
export async function replaceIdentity(
  dataDir: string,
  secretKey: Uint8Array,
  kubo: Kubo,
  keyName: string,
): Promise<string> {
  const archive = join(dataDir, `archive-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  await mkdir(archive, { recursive: true, mode: 0o700 })
  for (const file of IDENTITY_FILES) {
    await rename(join(dataDir, file), join(archive, file)).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err
    })
  }
  const keyFile: KeyFile = { secretKey: Buffer.from(secretKey).toString('base64') }
  await writeFile(join(dataDir, 'key.json'), JSON.stringify(keyFile), { mode: 0o600, flag: 'wx' })
  if ((await kubo.listKeys()).some((k) => k.name === keyName)) await kubo.removeKey(keyName)
  return archive
}

/**
 * Makes sure Kubo holds the same key under `keyName`, so IPNS publishes go to
 * the name derived from the user's did:key.
 */
export async function ensureKuboKey(kubo: Kubo, keyName: string, identity: Identity): Promise<void> {
  let key = (await kubo.listKeys()).find((k) => k.name === keyName)
  if (!key) {
    await kubo.importKey(keyName, libp2pPrivateKey(identity))
    key = (await kubo.listKeys()).find((k) => k.name === keyName)
  }
  if (key?.id !== identity.ipnsName) {
    throw new Error(
      `Kubo key "${keyName}" has IPNS name ${key?.id ?? '(missing)'}, expected ${identity.ipnsName}. ` +
        'Remove it with `ipfs key rm` or set SOCIALKEY_KEY_NAME to an unused name.',
    )
  }
}

/** libp2p PrivateKey protobuf: KeyType = Ed25519, data = seed || public key. */
function libp2pPrivateKey(identity: Identity): Uint8Array {
  const out = new Uint8Array(4 + 64)
  out.set([0x08, 0x01, 0x12, 0x40])
  out.set(identity.secretKey, 4)
  out.set(identity.publicKey, 36)
  return out
}
