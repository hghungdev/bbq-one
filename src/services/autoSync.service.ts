import { isAuthenticated } from '@/services/localFirst/authMode'
import { syncService } from '@/services/sync.service'
import {
  initNetworkReachability,
  isOnline,
  onNetworkStatusChange,
} from '@/services/networkReachability.service'

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

/** Chạy sync từ cache — dùng được trong SW lẫn popup. */
export async function runBackgroundAutoSync(reason: string): Promise<number> {
  if (syncInFlight) return 0
  if (!isOnline()) return 0
  if (!(await isAuthenticated())) return 0

  syncInFlight = true
  try {
    const count = await syncService.syncFromCache()
    if (count > 0) {
      try {
        await chrome.runtime.sendMessage({ type: AUTO_SYNC_MESSAGE, count })
      } catch {
        /* popup có thể đóng */
      }
    }
    return count
  } catch (e) {
    console.warn('[BBQOne] auto sync failed:', reason, e)
    return 0
  } finally {
    syncInFlight = false
  }
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
