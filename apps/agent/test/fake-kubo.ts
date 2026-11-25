import { CID, cidOf } from '@socialkey/core'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import type { Kubo, KuboKey } from '../src/kubo'

export class FakeKubo implements Kubo {
  blocks = new Map<string, Uint8Array>()
  published: { cid: CID; keyName: string }[] = []
  unpinned: CID[] = []
  pins = new Map<string, 'direct' | 'recursive'>()
  /** keyName → IPNS name, so publish() can record what each name resolves to. */
  keyNames = new Map<string, string>()
  names = new Map<string, CID>()
  records = new Map<string, Uint8Array>()
  reannounced: string[] = []
  keys: KuboKey[] = []
  failPublish = false
  /** Simulates the real network, where an IPNS publish takes a while. */
  publishDelayMs = 0
  /** Mimic Kubo's block/put pin=true, which pins recursively. */
  pinOnPut = false

  /** Returns stored bytes, failing the test if the block is missing. */
  block(cid: CID | undefined): Uint8Array {
    const bytes = cid && this.blocks.get(cid.toString())
    if (!bytes) throw new Error(`No block ${cid}`)
    return bytes
  }

  async putBlock(bytes: Uint8Array): Promise<CID> {
    const cid = await cidOf(bytes)
    this.blocks.set(cid.toString(), bytes)
    if (this.pinOnPut) this.pins.set(cid.toString(), 'recursive')
    return cid
  }

  async getBlock(cid: CID): Promise<Uint8Array> {
    return this.block(cid)
  }

  async removeKey(name: string): Promise<void> {
    this.keys = this.keys.filter((k) => k.name !== name)
  }

  async unpin(cid: CID): Promise<void> {
    this.unpinned.push(cid)
    this.pins.delete(cid.toString())
  }

  async pin(cid: CID, recursive: boolean): Promise<boolean> {
    this.block(cid)
    if (this.pins.get(cid.toString()) === 'recursive') return false
    this.pins.set(cid.toString(), recursive ? 'recursive' : 'direct')
    return true
  }

  async resolveName(name: string): Promise<CID> {
    const cid = this.names.get(name)
    if (!cid) throw new Error(`Could not resolve ${name}`)
    return cid
  }

  async getIpnsRecord(name: string): Promise<Uint8Array> {
    const record = this.records.get(name)
    if (!record) throw new Error(`No record for ${name}`)
    return record
  }

  async putIpnsRecord(name: string): Promise<void> {
    this.reannounced.push(name)
  }

  async addFile(bytes: Uint8Array): Promise<CID> {
    const cid = CID.createV1(raw.code, await sha256.digest(bytes))
    this.blocks.set(cid.toString(), bytes)
    return cid
  }

  async publish(cid: CID, keyName: string): Promise<void> {
    if (this.publishDelayMs) await new Promise((resolve) => setTimeout(resolve, this.publishDelayMs))
    if (this.failPublish) throw new Error('publish failed')
    this.published.push({ cid, keyName })
    const name = this.keyNames.get(keyName)
    if (name) {
      this.names.set(name, cid)
      this.records.set(name, new TextEncoder().encode(`record for ${cid}`))
    }
  }

  async listKeys(): Promise<KuboKey[]> {
    return this.keys
  }

  async importKey(name: string, protobufKey: Uint8Array): Promise<void> {
    // Kubo would derive the id from the key; tests set `keys` directly instead.
    this.keys.push({ name, id: `imported-${protobufKey.length}` })
  }
}
