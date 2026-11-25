import { CID } from '@socialkey/core'

export interface KuboKey {
  name: string
  id: string
}

/** The subset of the Kubo RPC API the agent uses. */
export interface Kubo {
  /** Stores already-encoded DAG-JSON bytes as-is and pins them. */
  putBlock(bytes: Uint8Array): Promise<CID>
  /** Adds a file (media) as UnixFS and pins it. */
  addFile(bytes: Uint8Array): Promise<CID>
  publish(cid: CID, keyName: string): Promise<void>
  listKeys(): Promise<KuboKey[]>
  /** Imports a libp2p protobuf-encoded private key. */
  importKey(name: string, protobufKey: Uint8Array): Promise<void>
}

export class KuboError extends Error {}

export class HttpKubo implements Kubo {
  constructor(private readonly api: string) {}

  async putBlock(bytes: Uint8Array): Promise<CID> {
    const res = await this.call<{ Key: string }>(
      'block/put',
      { 'cid-codec': 'dag-json', mhtype: 'sha2-256', pin: 'true' },
      bytes,
    )
    return CID.parse(res.Key)
  }

  async addFile(bytes: Uint8Array): Promise<CID> {
    const res = await this.call<{ Hash: string }>('add', { 'cid-version': '1', pin: 'true' }, bytes)
    return CID.parse(res.Hash)
  }

  async publish(cid: CID, keyName: string): Promise<void> {
    await this.call('name/publish', {
      arg: `/ipfs/${cid}`,
      key: keyName,
      lifetime: '48h',
      'allow-offline': 'true',
    })
  }

  async listKeys(): Promise<KuboKey[]> {
    const res = await this.call<{ Keys: { Name: string; Id: string }[] | null }>('key/list', {
      l: 'true',
      'ipns-base': 'base36',
    })
    return (res.Keys ?? []).map((k) => ({ name: k.Name, id: k.Id }))
  }

  async importKey(name: string, protobufKey: Uint8Array): Promise<void> {
    await this.call(
      'key/import',
      { arg: name, format: 'libp2p-protobuf-cleartext', 'ipns-base': 'base36' },
      protobufKey,
    )
  }

  private async call<T = unknown>(command: string, params: Record<string, string>, file?: Uint8Array): Promise<T> {
    const url = `${this.api}/api/v0/${command}?${new URLSearchParams(params)}`
    let body: FormData | undefined
    if (file) {
      body = new FormData()
      body.append('file', new Blob([file as Uint8Array<ArrayBuffer>]))
    }
    let res: Response
    try {
      res = await fetch(url, { method: 'POST', body })
    } catch (err) {
      throw new KuboError(`Cannot reach Kubo at ${this.api}: is \`ipfs daemon\` running?`, { cause: err })
    }
    const text = await res.text()
    if (!res.ok) throw new KuboError(`Kubo ${command} failed (${res.status}): ${text.trim()}`)
    // Some commands stream NDJSON; the final line holds the result.
    const last = text.trim().split('\n').at(-1) ?? '{}'
    return JSON.parse(last) as T
  }
}
