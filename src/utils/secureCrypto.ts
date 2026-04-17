/** AES-GCM 256 + PBKDF2; envelope cho title/content lưu Supabase. */

export const DEFAULT_PBKDF2_ITERATIONS = 310_000

/**
 * Chuỗi cố định mã hóa lưu `folders.secure_verifier_enc` để kiểm tra passphrase.
 * Giữ prefix `retronote:` — định dạng dữ liệu đã lưu / tương thích DB cũ (không đổi theo tên app).
 */
export const SECURE_VERIFIER_PLAINTEXT = 'retronote:unlock'

/** Bọc ciphertext title/content; cùng lý do giữ literal `retronote:1:` như trên. */
const ENVELOPE_PREFIX = 'retronote:1:'

/** Salt PBKDF2: 16 byte CSPRNG (128-bit entropy). */
export const SALT_BYTES = 16

export function generateSalt16(): Uint8Array {
  const salt = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(salt)
  return salt
}

export function saltToBase64(salt: Uint8Array): string {
  return bytesToBase64(salt)
}

export function saltFromBase64(b64: string): Uint8Array {
  return base64ToBytes(b64)
}

export function isEncryptedEnvelope(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX)
}

export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptField(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  )
  return `${ENVELOPE_PREFIX}${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`
}

export async function decryptField(envelope: string, key: CryptoKey): Promise<string> {
  if (!isEncryptedEnvelope(envelope)) {
    throw new Error('Invalid encrypted payload')
  }
  const rest = envelope.slice(ENVELOPE_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon === -1) throw new Error('Malformed encrypted payload')
  const ivB64 = rest.slice(0, colon)
  const ctB64 = rest.slice(colon + 1)
  const iv = base64ToBytes(ivB64)
  const ciphertext = base64ToBytes(ctB64)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  return new TextDecoder().decode(decrypted)
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}
