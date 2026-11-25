import { CID, cidOf } from '@socialkey/core'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import type { Kubo, KuboKey } from '../src/kubo'

export class FakeKubo implements Kubo {
  blocks = new Map<string, Uint8Array>()
  published: { cid: CID; keyName: string }[] = []
  keys: KuboKey[] = []
  failPublish = false

  /** Returns stored bytes, failing the test if the block is missing. */
  block(cid: CID | undefined): Uint8Array {
    const bytes = cid && this.blocks.get(cid.toString())
    if (!bytes) throw new Error(`No block ${cid}`)
    return bytes
  }

  async putBlock(bytes: Uint8Array): Promise<CID> {
    const cid = await cidOf(bytes)
    this.blocks.set(cid.toString(), bytes)
    return cid
  }

  async addFile(bytes: Uint8Array): Promise<CID> {
    const cid = CID.createV1(raw.code, await sha256.digest(bytes))
    this.blocks.set(cid.toString(), bytes)
    return cid
  }

  async publish(cid: CID, keyName: string): Promise<void> {
    if (this.failPublish) throw new Error('publish failed')
    this.published.push({ cid, keyName })
  }

  async listKeys(): Promise<KuboKey[]> {
    return this.keys
  }

  async importKey(name: string, protobufKey: Uint8Array): Promise<void> {
    // Kubo would derive the id from the key; tests set `keys` directly instead.
    this.keys.push({ name, id: `imported-${protobufKey.length}` })
  }
}
