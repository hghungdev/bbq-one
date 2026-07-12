/**
 * Ghi cache best-effort: KHÔNG throw — lỗi quota/disk không được giết thao tác
 * đã thành công (server save, offline edit in-memory). Lỗi được warn + báo qua onError.
 */
export async function safeCacheWrite(
  items: Record<string, unknown>,
  onError?: (e: unknown) => void,
): Promise<boolean> {
  try {
    await chrome.storage.local.set(items)
    return true
  } catch (e) {
    console.warn('[BBQOne] Cache write failed (storage quota/disk?):', e)
    try {
      onError?.(e)
    } catch {
      /* onError không được phép làm safeCacheWrite throw */
    }
    return false
  }
}

/**
 * N8: backup bookmark mã hóa PIN không được cache plaintext tree đã decrypt
 * xuống chrome.storage.local — strip tree trước khi persist.
 */
export function stripEncryptedBackupTrees<
  T extends { encrypted?: boolean; tree_json: unknown },
>(list: T[]): T[] {
  return list.map((b) => (b.encrypted ? { ...b, tree_json: [] } : b))
}
