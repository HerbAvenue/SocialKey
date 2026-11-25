import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSecretKey, identityFromSecretKey } from '@socialkey/core'
import { describe, expect, it } from 'vitest'
import { loadOrCreateIdentity, replaceIdentity } from '../src/keystore'
import { FakeKubo } from './fake-kubo'

describe('replaceIdentity', () => {
  it('archives the old identity, installs the new key and frees the Kubo key name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'socialkey-keys-'))
    const { identity: old } = await loadOrCreateIdentity(dir)
    await writeFile(join(dir, 'manifest.dagjson'), 'old manifest')
    const kubo = new FakeKubo()
    kubo.keys = [{ name: 'socialkey', id: old.ipnsName }]

    const next = generateSecretKey()
    const archive = await replaceIdentity(dir, next, kubo, 'socialkey')

    expect((await loadOrCreateIdentity(dir)).identity.did).toBe(identityFromSecretKey(next).did)
    expect((await readdir(archive)).sort()).toEqual(['key.json', 'manifest.dagjson'])
    expect(await readFile(join(archive, 'manifest.dagjson'), 'utf8')).toBe('old manifest')
    expect(kubo.keys).toEqual([])
  })
})
