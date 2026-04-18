import { supabase } from './supabase'
import { fetchBookmarkCryptoRow } from '@/services/bookmarkCryptoKeys.service'
import { bookmarksService } from './bookmarks.service'
import {
  getPersistedBookmarkTreeHash,
  hashBookmarkTree,
  setPersistedBookmarkTreeHash,
} from '@/utils/bookmarkFingerprint'
import { getBookmarkCryptoKeyFromSession } from '@/utils/bookmarkSessionKey'

/** Gom nhiều sự kiện bookmark liên tiếp (import / restore) thành một lần backup. */
const DEBOUNCE_MS = 4000

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Gọi từ background khi có thay đổi bookmark — debounce rồi backup nếu đã login
 * và cây hiện tại khác snapshot đã sync lần trước.
 */
export function scheduleBookmarkAutoBackup(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runBookmarkAutoBackup()
  }, DEBOUNCE_MS)
}

async function runBookmarkAutoBackup(): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    /* Chỉ auto-backup sau khi user đã đặt PIN (có bookmark_crypto) và đã mở khóa trong phiên. */
    const cryptoRow = await fetchBookmarkCryptoRow()
    if (!cryptoRow) return
    const key = await getBookmarkCryptoKeyFromSession()
    if (!key) return

    const tree = await bookmarksService.getFromBrowser()
    const fp = await hashBookmarkTree(tree)
    const last = await getPersistedBookmarkTreeHash()
    if (fp === last) return

    const label = `auto ${new Date().toLocaleString('sv')}`
    await bookmarksService.saveBackup(tree, label)
  } catch (e) {
    console.warn('[BBQNote] bookmark auto-backup failed', e)
  }
}

/**
 * Lần đầu sau khi cài / khởi động: nếu đã login mà chưa có hash baseline,
 * ghi hash của cây hiện tại (không tạo row trên Supabase) để lần sau chỉ backup khi có delta.
 */
export async function bootstrapBookmarkBaseline(): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const existing = await getPersistedBookmarkTreeHash()
    if (existing !== null) return

    const tree = await bookmarksService.getFromBrowser()
    await setPersistedBookmarkTreeHash(await hashBookmarkTree(tree))
  } catch (e) {
    console.warn('[BBQNote] bookmark baseline bootstrap failed', e)
  }
}
