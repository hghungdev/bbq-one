/**
 * Ghi cache best-effort: KHÔNG throw — lỗi quota/disk không được giết thao tác
 * đã thành công (server save, offline edit in-memory). Lỗi được warn + báo qua onError.
 */
/**
 * C11: chrome.storage không coi mảng reactive (Proxy) của Vue là mảng — lưu thành `{0:…,1:…}` và mọi
 * chỗ đọc `Array.isArray` coi cache rỗng. Chép sâu mảng + object thường thành dữ liệu thuần (chuỗi /
 * số dùng chung, không chép).
 */
export function toStorable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(toStorable)
  if (v === null || typeof v !== 'object') return v
  const proto = Object.getPrototypeOf(v)
  if (proto !== Object.prototype && proto !== null) return v
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v)) out[k] = toStorable(val)
  return out
}

/**
 * Đọc mảng từ cache; nhận cả cache đã hỏng dạng `{0:…,1:…}` của bản cũ (C11) để không mất row dirty.
 * Không phải mảng / object chỉ số → null.
 */
export function readCachedArray<T>(raw: unknown): T[] | null {
  if (Array.isArray(raw)) return raw as T[]
  if (raw === null || typeof raw !== 'object') return null
  const keys = Object.keys(raw)
  if (!keys.every((k) => /^\d+$/.test(k))) return null
  return keys
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => (raw as Record<number, T>)[i])
}

export async function safeCacheWrite(
  items: Record<string, unknown>,
  onError?: (e: unknown) => void,
): Promise<boolean> {
  try {
    const plain: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(items)) plain[k] = toStorable(v)
    await chrome.storage.local.set(plain)
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
