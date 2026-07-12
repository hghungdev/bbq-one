import { isAuthenticated } from '@/services/localFirst/authMode'
import { isRowDirty, syncService } from '@/services/sync.service'
import { pushLocalToCloud } from '@/services/localFirst/syncEngine.service'
import { localStore } from '@/services/localFirst/localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import {
  initNetworkReachability,
  isOnline,
  onNetworkStatusChange,
} from '@/services/networkReachability.service'
import { NOTE_BODIES_CACHE_KEY, NOTES_CACHE_KEY } from '@/constants/storage'
import { CALENDAR_EVENTS_CACHE_KEY } from '@/constants/calendar'
import { SYNC_LOCK, withWebLock } from '@/utils/webLock'

/** Debounce sau sự kiện online — tránh sync liên tục khi mạng chập chờn. */
const ONLINE_DEBOUNCE_MS = 4_000
/** Chờ thêm sau online trước lần sync đầu — “mạng ổn định”. */
const ONLINE_STABLE_MS = 2_000

const AUTO_SYNC_MESSAGE = 'bbqone-auto-sync-complete'

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let stableTimer: ReturnType<typeof setTimeout> | null = null
let syncInFlight = false
let listenersAttached = false

export type AutoSyncCompleteMessage = { type: typeof AUTO_SYNC_MESSAGE }

export function isAutoSyncCompleteMessage(msg: unknown): msg is AutoSyncCompleteMessage {
  return typeof msg === 'object' && msg !== null && (msg as AutoSyncCompleteMessage).type === AUTO_SYNC_MESSAGE
}

function clearTimers(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (stableTimer !== null) {
    clearTimeout(stableTimer)
    stableTimer = null
  }
}

/** Lên lịch auto sync (popup đang mở hoặc sau khi sửa offline). */
export function scheduleAutoSync(_reason: string): void {
  if (!isOnline()) return
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runBackgroundAutoSync(_reason)
  }, ONLINE_DEBOUNCE_MS)
}

/** Có entry nào tạo offline (LocalFirst storage còn dữ liệu) cần push lên cloud không? */
export async function hasLocalFirstPending(): Promise<boolean> {
  for (const key of [
    LOCAL_STORAGE_KEYS.folders,
    LOCAL_STORAGE_KEYS.notes,
    LOCAL_STORAGE_KEYS.noteBodies,
    LOCAL_STORAGE_KEYS.calendarEvents,
    LOCAL_STORAGE_KEYS.bookmarks,
  ]) {
    const arr = await localStore.getArray<unknown>(key)
    if (arr.length > 0) return true
  }
  return false
}

/** Có việc cần push không (local-first pending HOẶC row dirty trong cache)? — check local-only, rẻ. */
export async function hasPendingSyncWork(): Promise<boolean> {
  if (await hasLocalFirstPending()) return true
  const chunk = await chrome.storage.local.get([
    NOTES_CACHE_KEY,
    NOTE_BODIES_CACHE_KEY,
    CALENDAR_EVENTS_CACHE_KEY,
  ])
  const anyDirty = (arr: unknown): boolean =>
    Array.isArray(arr) &&
    arr.some((r) => isRowDirty(r as { updated_at: string; synced_at?: string | null }))
  return (
    anyDirty(chunk[NOTES_CACHE_KEY]) ||
    anyDirty(chunk[NOTE_BODIES_CACHE_KEY]) ||
    anyDirty(chunk[CALENDAR_EVENTS_CACHE_KEY])
  )
}

/** Chạy sync từ cache — dùng được trong SW lẫn popup.
 *  Bao gồm: (1) push entry tạo offline trong LocalFirst (insert mới); rồi
 *  (2) sync dirty rows từ NOTES_CACHE_KEY (update existing). */
export async function runBackgroundAutoSync(reason: string): Promise<number> {
  if (syncInFlight) return 0
  if (!isOnline()) return 0
  if (!(await isAuthenticated())) return 0

  return withWebLock(SYNC_LOCK, async () => {
    syncInFlight = true
    try {
      let total = 0
      if (await hasLocalFirstPending()) {
        try {
          const result = await pushLocalToCloud('use-local')
          total
            += result.pushedNotes
            + result.pushedNoteBodies
            + result.pushedFolders
            + result.pushedCalendarEvents
        } catch (e) {
          console.warn('[BBQOne] pushLocalToCloud failed:', reason, e)
        }
      }
      const count = await syncService.syncFromCache()
      total += count
      if (total > 0) {
        try {
          await chrome.runtime.sendMessage({ type: AUTO_SYNC_MESSAGE, count: total })
        } catch {
          /* popup có thể đóng */
        }
      }
      return total
    } catch (e) {
      console.warn('[BBQOne] auto sync failed:', reason, e)
      return 0
    } finally {
      syncInFlight = false
    }
  })
}

/** Lắng nghe online → debounce → sync nền. */
export function initAutoSyncOnNetworkRestore(): () => void {
  initNetworkReachability()
  if (listenersAttached) {
    return () => clearTimers()
  }
  listenersAttached = true

  const unsub = onNetworkStatusChange((online) => {
    if (!online) {
      clearTimers()
      return
    }
    if (stableTimer !== null) clearTimeout(stableTimer)
    stableTimer = setTimeout(() => {
      stableTimer = null
      scheduleAutoSync('network-online')
    }, ONLINE_STABLE_MS)
  })

  return () => {
    unsub()
    clearTimers()
  }
}
