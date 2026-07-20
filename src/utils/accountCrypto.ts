import { ENVELOPE_V2_ALG, formatEnvelopeV2, parseEnvelopeV2 } from '@/utils/secureCrypto'

/** S2B: hạ tầng DEK/KEK account-level (ADR §4, §6, §13). Chưa data path nào dùng — S2C. */

export const ACCOUNT_KDF = 'pbkdf2-sha256'
export const ACCOUNT_PBKDF2_ITERATIONS = 600_000
export const ACCOUNT_VERIFIER_PLAINTEXT = 'bbq:unlock:v2'
/** 160-bit → 32 ký tự base32 → 8 nhóm 4 (ADR §6). */
export const RECOVERY_KEY_BYTES = 20

export interface KdfParams {
  iterations: number
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const HKDF_INFO_RECOVERY = 'bbq:recovery:v2'
const HKDF_INFO_CONTENT = 'bbq:content:v2'
const HKDF_INFO_INDEX = 'bbq:blind-index:v2'

export function generateDekBytes(): Uint8Array {
  const dek = new Uint8Array(32)
  crypto.getRandomValues(dek)
  return dek
}

export function generateKdfSalt(): Uint8Array {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return salt
}

export async function deriveKekFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: params.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Wrap DEK bytes bằng KEK/RKEK → envelope v2 (kid = dek_id, vd 'k1'). */
export async function wrapDek(
  dekBytes: Uint8Array,
  wrappingKey: CryptoKey,
  kid: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, dekBytes)
  return formatEnvelopeV2(ENVELOPE_V2_ALG, kid, bytesToB64(iv), bytesToB64(new Uint8Array(ct)))
}

/** Unwrap → DEK bytes. Sai key/hỏng dữ liệu → throw (GCM auth). */
export async function unwrapDek(wrappedDek: string, wrappingKey: CryptoKey): Promise<Uint8Array> {
  const env = parseEnvelopeV2(wrappedDek)
  if (!env) throw new Error('Malformed wrapped DEK')
  if (env.alg !== ENVELOPE_V2_ALG) throw new Error('Unsupported envelope algorithm')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(env.ivB64) },
    wrappingKey,
    b64ToBytes(env.ctB64),
  )
  return new Uint8Array(plain)
}

export async function makeVerifier(kek: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    new TextEncoder().encode(ACCOUNT_VERIFIER_PLAINTEXT),
  )
  return formatEnvelopeV2(ENVELOPE_V2_ALG, 'kek', bytesToB64(iv), bytesToB64(new Uint8Array(ct)))
}

/** true = đúng passphrase; false = sai (KHÔNG throw — caller phân biệt sai-pass với lỗi khác). */
export async function checkVerifier(verifier: string, kek: CryptoKey): Promise<boolean> {
  const env = parseEnvelopeV2(verifier)
  if (!env) return false
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(env.ivB64) },
      kek,
      b64ToBytes(env.ctB64),
    )
    return new TextDecoder().decode(plain) === ACCOUNT_VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

/** Sinh recovery key 160-bit; display dạng 8 nhóm 4 ký tự base32: XXXX-XXXX-…-XXXX. */
export function generateRecoveryKey(): { display: string; bytes: Uint8Array } {
  const bytes = new Uint8Array(RECOVERY_KEY_BYTES)
  crypto.getRandomValues(bytes)
  const raw = base32Encode(bytes)
  const display = raw.replace(/(.{4})(?=.)/g, '$1-')
  return { display, bytes }
}

/** Chịu lỗi nhập: thường/hoa, thiếu/thừa dấu -, khoảng trắng. Sai độ dài/ký tự → throw. */
export function parseRecoveryKey(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-Z2-7]{32}$/.test(cleaned)) {
    throw new Error('Invalid recovery key')
  }
  return base32Decode(cleaned)
}

export async function deriveRecoveryKek(recoveryBytes: Uint8Array): Promise<CryptoKey> {
  return hkdfAesKey(recoveryBytes, HKDF_INFO_RECOVERY)
}

export async function deriveContentKey(dekBytes: Uint8Array): Promise<CryptoKey> {
  return hkdfAesKey(dekBytes, HKDF_INFO_CONTENT)
}

export async function deriveIndexKey(dekBytes: Uint8Array): Promise<CryptoKey> {
  return hkdfAesKey(dekBytes, HKDF_INFO_INDEX)
}

async function hkdfAesKey(keyBytes: Uint8Array, info: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(s: string): Uint8Array {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of s) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('Invalid recovery key')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
