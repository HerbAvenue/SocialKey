import { describe, expect, it } from 'vitest'
import { didToIpnsName, didToPublicKey, generateSecretKey, identityFromSecretKey, ipnsNameToDid } from '../src'

describe('did:key and IPNS names', () => {
  const identity = identityFromSecretKey(generateSecretKey())

  it('round-trips a public key through did:key', () => {
    expect(identity.did).toMatch(/^did:key:z6Mk/)
    expect(didToPublicKey(identity.did)).toEqual(identity.publicKey)
  })

  it('derives a base36 IPNS name and maps it back to the did', () => {
    expect(identity.ipnsName).toMatch(/^k51/)
    expect(didToIpnsName(identity.did)).toBe(identity.ipnsName)
    expect(ipnsNameToDid(identity.ipnsName)).toBe(identity.did)
  })

  it('matches the did:key spec test vector', () => {
    // https://w3c-ccg.github.io/did-method-key/#ed25519-x25519
    const did = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp'
    expect(didToPublicKey(did)).toHaveLength(32)
    expect(ipnsNameToDid(didToIpnsName(did))).toBe(did)
  })

  it('rejects non-Ed25519 dids', () => {
    expect(() => didToPublicKey('did:web:example.com')).toThrow()
    expect(() => didToPublicKey('did:key:zQ3shokFTS3brHcDQrn82RUDfCZESWL1ZdCEJwekUDPQiYBme')).toThrow()
  })
})
