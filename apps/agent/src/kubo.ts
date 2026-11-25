import { CID } from '@socialkey/core'

export interface KuboKey {
  name: string
  id: string
}

/** The subset of the Kubo RPC API the agent uses. */
export interface Kubo {
  /** Stores already-encoded DAG-JSON bytes as-is and pins them. */
  putBlock(bytes: Uint8Array): Promise<CID>
  /** Reads a raw block. */
  getBlock(cid: CID): Promise<Uint8Array>
  /** Unpins a block so Kubo's garbage collector can remove it. Missing pins are ignored. */
  unpin(cid: CID): Promise<void>
  /** Adds a file (media) as UnixFS and pins it. */
  addFile(bytes: Uint8Array): Promise<CID>
  publish(cid: CID, keyName: string): Promise<void>
  listKeys(): Promise<KuboKey[]>
  /** Imports a libp2p protobuf-encoded private key. */
  importKey(name: string, protobufKey: Uint8Array): Promise<void>
  /**
   * Pins a block (direct) or a whole DAG (recursive), fetching it from the network if needed.
   * Returns false when it was already pinned recursively, i.e. by someone else's pin.
   */
  pin(cid: CID, recursive: boolean): Promise<boolean>
  /** The CID an IPNS name currently points to. */
  resolveName(name: string): Promise<CID>
  /** The signed IPNS record behind a name, as raw bytes. */
  getIpnsRecord(name: string): Promise<Uint8Array>
  /** Re-announces someone's signed IPNS record. Kubo checks the signature. */
  putIpnsRecord(name: string, record: Uint8Array): Promise<void>
}

export class KuboError extends Error {}

export class HttpKubo implements Kubo {
  /** `gateway` serves IPNS records over the routing API, which also works while Kubo is offline. */
  constructor(
    private readonly api: string,
    private readonly gateway?: string,
  ) {}

  async putBlock(bytes: Uint8Array): Promise<CID> {
    const res = await this.call<{ Key: string }>(
      'block/put',
      { 'cid-codec': 'dag-json', mhtype: 'sha2-256', pin: 'true' },
      bytes,
    )
    return CID.parse(res.Key)
  }

  async getBlock(cid: CID): Promise<Uint8Array> {
    const res = await this.request('block/get', { arg: cid.toString() })
    return new Uint8Array(await res.arrayBuffer())
  }

  async unpin(cid: CID): Promise<void> {
    try {
      await this.call('pin/rm', { arg: cid.toString() })
    } catch (err) {
      if (!(err instanceof KuboError && /not pinned/.test(err.message))) throw err
    }
  }

  async pin(cid: CID, recursive: boolean): Promise<boolean> {
    try {
      await this.call('pin/add', { arg: cid.toString(), recursive: String(recursive) })
      return true
    } catch (err) {
      if (err instanceof KuboError && /already pinned recursively/.test(err.message)) return false
      throw err
    }
  }

  async resolveName(name: string): Promise<CID> {
    const res = await this.call<{ Path: string }>('name/resolve', { arg: name, recursive: 'true' })
    return CID.parse(res.Path.replace(/^\/ipfs\//, ''))
  }

  async getIpnsRecord(name: string): Promise<Uint8Array> {
    if (!this.gateway)
      return new Uint8Array(await (await this.request('routing/get', { arg: `/ipns/${name}` })).arrayBuffer())
    const res = await fetch(`${this.gateway}/routing/v1/ipns/${name}`, {
      headers: { accept: 'application/vnd.ipfs.ipns-record' },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new KuboError(`No IPNS record found for ${name} (${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
  }

  async putIpnsRecord(name: string, record: Uint8Array): Promise<void> {
    await this.call('routing/put', { arg: `/ipns/${name}`, 'allow-offline': 'true' }, record)
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
      // How long resolvers may cache the record: short, so followers see new posts quickly.
      ttl: '1m',
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
    const text = await (await this.request(command, params, file)).text()
    // Some commands stream NDJSON; the final line holds the result.
    const last = text.trim().split('\n').at(-1) ?? '{}'
    return JSON.parse(last) as T
  }

  private async request(command: string, params: Record<string, string>, file?: Uint8Array): Promise<Response> {
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
    if (!res.ok) throw new KuboError(`Kubo ${command} failed (${res.status}): ${(await res.text()).trim()}`)
    return res
  }
}
