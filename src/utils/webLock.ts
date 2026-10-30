/**
 * Mutex cross-context qua Web Locks API — popup, dashboard-tab và service worker của
 * extension chung origin nên chung lock scope. Môi trường không có Web Locks
 * (unit test Node) → chạy thẳng, không lock.
 */
export async function withWebLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks
  if (!locks) return fn()
  return locks.request(name, fn) as Promise<T>
}

export const PENDING_DELETES_LOCK = 'bbqone-pending-deletes'
export const CONFLICT_BACKUPS_LOCK = 'bbqone-conflict-backups'

/** N6/N9: serialize push-sync giữa popup + dashboard-tab + SW (syncInFlight chỉ per-context). */
export const SYNC_LOCK = 'bbqone-sync'

/** N13: serialize luồng copy qua offscreen document (create → sendMessage → close). */
export const OFFSCREEN_CLIPBOARD_LOCK = 'bbqone-offscreen-clipboard'
