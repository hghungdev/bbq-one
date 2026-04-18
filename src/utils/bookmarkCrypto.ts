import type { BookmarkNode } from '@/types/bookmark'

const PBKDF2_ITERATIONS = 120_000
const AES_IV_LENGTH = 12
const VERIFIER_JSON = JSON.stringify({ v: 1, alg: 'bbqnote-bookmark-pin-v1' })

function abToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function b64ToAb(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Derive AES-256-GCM key từ PIN + salt (salt base64 lưu DB). */
export async function deriveBookmarkKeyFromPin(
  pin: string,
  saltB64: string,
): Promise<CryptoKey> {
  const salt = b64ToAb(saltB64)
  const enc = new TextEncoder().encode(pin)
  const keyMaterial = await crypto.subtle.importKey('raw', enc, 'PBKDF2', false, [
    'deriveKey',
    'deriveBits',
  ])
  /* extractable: true — cần export raw khi lưu khóa vào chrome.storage.session (popup/background). */
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

/** Tạo salt ngẫu nhiên (base64). */
export function generateSaltB64(): string {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return abToB64(salt.buffer)
}

/** Mã hóa verifier JSON để lưu DB — dùng lúc đặt PIN. */
export async function encryptVerifier(
  key: CryptoKey,
): Promise<{ ivB64: string; ctB64: string }> {
  const iv = new Uint8Array(AES_IV_LENGTH)
  crypto.getRandomValues(iv)
  const plain = new TextEncoder().encode(VERIFIER_JSON)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return { ivB64: abToB64(iv.buffer), ctB64: abToB64(ct) }
}

/** Giải mã verifier — đúng PIN thì parse JSON thành công. */
export async function verifyPinAgainstStored(
  key: CryptoKey,
  verifierIvB64: string,
  verifierCtB64: string,
): Promise<boolean> {
  try {
    const iv = new Uint8Array(b64ToAb(verifierIvB64))
    const ct = b64ToAb(verifierCtB64)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    const text = new TextDecoder().decode(pt)
    const o = JSON.parse(text) as { v?: number; alg?: string }
    return o.v === 1 && o.alg === 'bbqnote-bookmark-pin-v1'
  } catch {
    return false
  }
}

export async function encryptBookmarkTree(
  tree: BookmarkNode[],
  key: CryptoKey,
): Promise<{ ivB64: string; ctB64: string }> {
  const iv = new Uint8Array(AES_IV_LENGTH)
  crypto.getRandomValues(iv)
  const plain = new TextEncoder().encode(JSON.stringify(tree))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return { ivB64: abToB64(iv.buffer), ctB64: abToB64(ct) }
}

export async function decryptBookmarkTree(
  ivB64: string,
  ctB64: string,
  key: CryptoKey,
): Promise<BookmarkNode[]> {
  const iv = new Uint8Array(b64ToAb(ivB64))
  const ct = b64ToAb(ctB64)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  const text = new TextDecoder().decode(pt)
  return JSON.parse(text) as BookmarkNode[]
}

export async function exportKeyToRawB64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return abToB64(raw)
}

export async function importKeyFromRawB64(b64: string): Promise<CryptoKey> {
  const raw = b64ToAb(b64)
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
