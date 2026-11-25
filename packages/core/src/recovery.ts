import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

/**
 * A secret key as 24 English words (BIP-39 encoding of the 32-byte Ed25519
 * seed), so people can write their account down and restore it anywhere.
 */
export function secretKeyToPhrase(secretKey: Uint8Array): string {
  if (secretKey.length !== 32) throw new Error('Expected a 32-byte secret key')
  return entropyToMnemonic(secretKey, wordlist)
}

/** The secret key in a recovery phrase. Tolerates extra spaces and capitals. */
export function phraseToSecretKey(phrase: string): Uint8Array {
  const normalized = normalizePhrase(phrase)
  if (normalized.split(' ').length !== 24 || !validateMnemonic(normalized, wordlist)) {
    throw new Error("That isn't a valid 24-word recovery phrase. Check the words and their order.")
  }
  return mnemonicToEntropy(normalized, wordlist)
}

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(' ')
}
