import { describe, expect, it } from 'vitest'
import { fromBase64, verifyIpnsRecord } from '../src'

// A real record published by Kubo for one of the demo profiles.
const fixture = {
  name: 'k51qzi5uqu5dlxkeldegip99uaxg0449czc5pfui5i8c24qtlu6o9n2w8ls0cu',
  value: '/ipfs/baguqeera2n26oxru7puoak6ovojowhube2xrc4jkthkfq6koaujzxdzo6wkq',
  record:
    'CkMvaXBmcy9iYWd1cWVlcmEybjI2b3hydTdwdW9hazZvdm9qb3dodWJlMnhyYzRqa3Roa2ZxNmtvYXVqenhkem82d2txEkDqtNEyehQ6Tf6Ar8ePvi9xG2Ob7vKIXYixfr0lLvhbUdY7uaw+vCZNMX+2lj3+MhQQ2SnEdqG9vIpZz2CmzjgJGAAiHjIwMjYtMTEtMjdUMTk6MjE6NDUuMzkzNzgyMjM3WigMMIDwksvdCEJA6cfiev4D10EuRP57tZAsvHyf2zEDN+tJca6zMYJZZ08k5YP43psM57ERBiYS3BSxd0fl1aKO2eHBQV+MbvkXCkqaAaVjVFRMGwAAAEXZZLgAZVZhbHVlWEMvaXBmcy9iYWd1cWVlcmEybjI2b3hydTdwdW9hazZvdm9qb3dodWJlMnhyYzRqa3Roa2ZxNmtvYXVqenhkem82d2txaFNlcXVlbmNlDGhWYWxpZGl0eVgeMjAyNi0xMS0yN1QxOToyMTo0NS4zOTM3ODIyMzdabFZhbGlkaXR5VHlwZQA=',
}
const record = fromBase64(fixture.record)
const recorded = Date.parse('2026-11-25T19:40:00Z')

describe('verifyIpnsRecord', () => {
  it('verifies a Kubo record and returns its CID', () => {
    const { cid } = verifyIpnsRecord(fixture.name, record, recorded)
    expect(`/ipfs/${cid}`).toBe(fixture.value)
  })

  it('rejects a tampered record', () => {
    const tampered = new Uint8Array(record)
    tampered[tampered.length - 5] = (tampered[tampered.length - 5] ?? 0) ^ 1
    expect(() => verifyIpnsRecord(fixture.name, tampered, recorded)).toThrow()
  })

  it("rejects a record presented under someone else's name", () => {
    const other = 'k51qzi5uqu5dltysmu9y5bj17tqwwtgmdjxzs4pchb3t9jicad296vnwyex5pi'
    expect(() => verifyIpnsRecord(other, record, recorded)).toThrow(/signature/)
  })

  it('rejects an expired record', () => {
    expect(() => verifyIpnsRecord(fixture.name, record, recorded + 365 * 86_400_000)).toThrow(/expired/)
  })
})

describe('blockMatches', () => {
  it('accepts the right bytes and rejects others', async () => {
    const { blockMatches, cidOf, encode } = await import('../src')
    const bytes = encode({ hello: 'world' })
    const cid = await cidOf(bytes)
    expect(await blockMatches(cid, bytes)).toBe(true)
    expect(await blockMatches(cid, encode({ hello: 'there' }))).toBe(false)
  })
})
