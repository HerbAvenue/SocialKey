import { ed25519 } from '@noble/curves/ed25519.js'
import { decode as decodeCbor } from 'cborg'
import { CID } from 'multiformats/cid'
import { didToPublicKey, ipnsNameToDid } from './did'

/**
 * Verifies a signed IPNS record for an Ed25519 name and returns the CID it
 * points to. SocialKey names embed their public key, so no key lookup is
 * needed: only the record's V2 signature (over "ipns-signature:" + its CBOR
 * data), its expiry, and its value are checked.
 */
export function verifyIpnsRecord(name: string, record: Uint8Array, now = Date.now()): { cid: CID; sequence: bigint } {
  const fields = parseProtobuf(record)
  const signature = fields.get(8)
  const data = fields.get(9)
  if (!signature || !data) throw new Error('IPNS record has no V2 signature')

  const publicKey = didToPublicKey(ipnsNameToDid(name))
  const signed = new Uint8Array(PREFIX.length + data.length)
  signed.set(PREFIX)
  signed.set(data, PREFIX.length)
  if (!ed25519.verify(signature, signed, publicKey)) throw new Error('IPNS record signature is invalid')

  const entries = decodeCbor(data, { useMaps: true }) as Map<string, unknown>
  const value = entries.get('Value')
  const validity = entries.get('Validity')
  if (entries.get('ValidityType') !== 0 || !(validity instanceof Uint8Array))
    throw new Error('IPNS record has no expiry')
  if (Date.parse(new TextDecoderLite().decode(validity)) < now) throw new Error('IPNS record has expired')
  if (!(value instanceof Uint8Array)) throw new Error('IPNS record has no value')

  const path = new TextDecoderLite().decode(value)
  if (!path.startsWith('/ipfs/')) throw new Error(`Unsupported IPNS value: ${path}`)
  const sequence = entries.get('Sequence')
  return {
    cid: CID.parse(path.slice('/ipfs/'.length)),
    sequence: BigInt(typeof sequence === 'number' || typeof sequence === 'bigint' ? sequence : 0),
  }
}

const PREFIX = Uint8Array.from('ipns-signature:', (c) => c.charCodeAt(0))

/** Length-delimited fields of a protobuf message, by field number (other wire types are skipped). */
function parseProtobuf(bytes: Uint8Array): Map<number, Uint8Array> {
  const fields = new Map<number, Uint8Array>()
  let i = 0
  const varint = (): number => {
    let result = 0
    let shift = 0
    for (;;) {
      const byte = bytes[i++]
      if (byte === undefined) throw new Error('Truncated IPNS record')
      result += (byte & 0x7f) * 2 ** shift
      if (byte < 0x80) return result
      shift += 7
    }
  }
  while (i < bytes.length) {
    const key = varint()
    const wireType = key & 7
    if (wireType === 0) varint()
    else if (wireType === 2) {
      const length = varint()
      fields.set(Math.floor(key / 8), bytes.subarray(i, i + length))
      i += length
    } else if (wireType === 1) i += 8
    else if (wireType === 5) i += 4
    else throw new Error('Malformed IPNS record')
  }
  return fields
}

/** ASCII/UTF-8 decoding without relying on DOM or Node typings (core is environment-neutral). */
class TextDecoderLite {
  decode(bytes: Uint8Array): string {
    return decodeURIComponent(Array.from(bytes, (b) => `%${b.toString(16).padStart(2, '0')}`).join(''))
  }
}
