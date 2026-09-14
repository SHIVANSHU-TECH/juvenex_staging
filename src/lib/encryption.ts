import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'crypto'
import { logger } from '@/lib/logger'

/**
 * PHI Encryption (HIPAA §164.312(a)(2)(iv))
 * -----------------------------------------
 * Symmetric AES-256-GCM with scrypt KDF.
 *
 * Ciphertext envelope formats handled:
 *   - v1 (current):   "v1:<ivHex>:<tagHex>:<ciphertextHex>"   (scrypt KDF)
 *   - legacy (read):  "<ivHex>:<tagHex>:<ciphertextHex>"      (SHA-256 KDF, old writes)
 *
 * KEY_VERSION rotation strategy:
 *   When a key is rotated, bump KEY_VERSION (e.g. v2), keep the prior
 *   versioned decrypt branch so existing rows remain readable, and add a
 *   background job to re-encrypt rows from the old version to the new one.
 *   Never change ENCRYPTION_KEY_SALT without re-encrypting every ciphertext
 *   that was written under the previous salt — doing so will permanently
 *   break decryption.
 */

const ALGORITHM = 'aes-256-gcm'
const KEY_VERSION = 1 as const
const V1_PREFIX = `v${KEY_VERSION}:`
const SCRYPT_KEY_LEN = 32

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is required')
}
if (ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters')
}

const ENCRYPTION_KEY_SALT = process.env.ENCRYPTION_KEY_SALT
if (!ENCRYPTION_KEY_SALT) {
  throw new Error(
    'ENCRYPTION_KEY_SALT environment variable is required (32 random bytes hex). ' +
      'Never rotate this salt without re-encrypting all existing PHI ciphertexts.'
  )
}
if (ENCRYPTION_KEY_SALT.length < 32) {
  throw new Error('ENCRYPTION_KEY_SALT must be at least 32 characters (hex-encoded bytes)')
}

// Derive both keys once at module load. scrypt is deliberately expensive so
// we avoid re-running it on every call.
const V1_KEY: Buffer = scryptSync(
  ENCRYPTION_KEY,
  Buffer.from(ENCRYPTION_KEY_SALT, 'utf8'),
  SCRYPT_KEY_LEN
)

// Legacy key retained ONLY so historical ciphertexts written before the
// scrypt migration (e.g. appointments.intake_data rows) remain decryptable.
// Do not use for new writes.
const LEGACY_KEY: Buffer = createHash('sha256').update(ENCRYPTION_KEY).digest()

function encryptWithKey(plaintext: string, key: Buffer): {
  iv: Buffer
  authTag: Buffer
  ciphertext: string
} {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex')
  ciphertext += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return { iv, authTag, ciphertext }
}

function decryptWithKey(
  ivHex: string,
  authTagHex: string,
  ciphertext: string,
  key: Buffer
): string {
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  let plaintext = decipher.update(ciphertext, 'hex', 'utf8')
  plaintext += decipher.final('utf8')
  return plaintext
}

export function encryptPHI(plaintext: string): string {
  const { iv, authTag, ciphertext } = encryptWithKey(plaintext, V1_KEY)
  return `${V1_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`
}

export function decryptPHI(ciphertext: string): string {
  // v1+ envelope: "v<N>:<iv>:<tag>:<ct>"
  if (ciphertext.startsWith('v')) {
    const firstColon = ciphertext.indexOf(':')
    if (firstColon > 0) {
      const versionTag = ciphertext.slice(0, firstColon)
      const rest = ciphertext.slice(firstColon + 1)
      const parts = rest.split(':')
      if (parts.length !== 3) {
        throw new Error('Invalid versioned ciphertext envelope')
      }
      const [ivHex, authTagHex, encrypted] = parts
      if (versionTag === `v${KEY_VERSION}`) {
        return decryptWithKey(ivHex, authTagHex, encrypted, V1_KEY)
      }
      throw new Error(`Unsupported ciphertext version: ${versionTag}`)
    }
  }

  // Legacy unversioned envelope: "<iv>:<tag>:<ct>" — SHA-256 KDF.
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid legacy ciphertext envelope')
  }
  const [ivHex, authTagHex, encrypted] = parts
  return decryptWithKey(ivHex, authTagHex, encrypted, LEGACY_KEY)
}

export function encryptArray(items: string[]): string {
  return encryptPHI(JSON.stringify(items))
}

export function decryptArray(ciphertext: string): string[] {
  try {
    const parsed: unknown = JSON.parse(decryptPHI(ciphertext))
    if (!Array.isArray(parsed)) {
      logger.warn('decryptArray: decrypted value is not an array')
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch (error: unknown) {
    logger.warn('decryptArray: failed to decrypt or parse JSON', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}
