import { BOOKMARK_AES_SESSION_KEY } from '@/constants/bookmark'
import { exportKeyToRawB64, importKeyFromRawB64 } from '@/utils/bookmarkCrypto'

/** Lưu khóa vào chrome.storage.session (popup + background dùng chung sau khi nhập PIN). */
export async function persistBookmarkCryptoKeyToSession(key: CryptoKey): Promise<void> {
  const b64 = await exportKeyToRawB64(key)
  await chrome.storage.session.set({ [BOOKMARK_AES_SESSION_KEY]: b64 })
}

export async function getBookmarkCryptoKeyFromSession(): Promise<CryptoKey | null> {
  const r = await chrome.storage.session.get(BOOKMARK_AES_SESSION_KEY)
  const b64 = r[BOOKMARK_AES_SESSION_KEY]
  if (typeof b64 !== 'string' || !b64) return null
  try {
    return await importKeyFromRawB64(b64)
  } catch {
    return null
  }
}

export async function clearBookmarkCryptoKeyFromSession(): Promise<void> {
  await chrome.storage.session.remove(BOOKMARK_AES_SESSION_KEY)
}
