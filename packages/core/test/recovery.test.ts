import { describe, expect, it } from 'vitest'
import { generateSecretKey, identityFromSecretKey, phraseToSecretKey, secretKeyToPhrase } from '../src'

describe('recovery phrases', () => {
  it('round-trips a key through 24 words', () => {
    const key = generateSecretKey()
    const phrase = secretKeyToPhrase(key)
    expect(phrase.split(' ')).toHaveLength(24)
    expect(identityFromSecretKey(phraseToSecretKey(phrase)).did).toBe(identityFromSecretKey(key).did)
  })

  it('accepts messy whitespace and capitals', () => {
    const key = generateSecretKey()
    const messy = `  ${secretKeyToPhrase(key).toUpperCase().split(' ').join('   \n')} `
    expect(phraseToSecretKey(messy)).toEqual(key)
  })

  it('rejects typos and short phrases', () => {
    const words = secretKeyToPhrase(generateSecretKey()).split(' ')
    expect(() => phraseToSecretKey(words.slice(0, 12).join(' '))).toThrow(/24-word/)
    const swapped = [...words]
    ;[swapped[0], swapped[1]] = [swapped[1] as string, swapped[0] as string]
    // A swap almost always breaks the checksum; if not, it must at least decode to a different key.
    try {
      expect(phraseToSecretKey(swapped.join(' '))).not.toEqual(phraseToSecretKey(words.join(' ')))
    } catch (err) {
      expect(String(err)).toMatch(/24-word/)
    }
  })
})
