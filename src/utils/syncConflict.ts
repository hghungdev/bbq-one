/** Supabase RPC optimistic lock (migration 014) — client helpers. */

export const C9_OPTIMISTIC_RPC_ENABLED = true

export class SyncConflictError extends Error {
  constructor(message = 'BBQ_CONFLICT') {
    super(message)
    this.name = 'SyncConflictError'
  }
}

export function isSyncConflictError(error: unknown): boolean {
  if (error instanceof SyncConflictError) return true
  if (typeof error === 'object' && error !== null) {
    const e = error as { code?: string; message?: string; details?: string }
    if (e.code === 'P0001') return true
    const msg = `${e.message ?? ''} ${e.details ?? ''}`
    if (msg.includes('BBQ_CONFLICT')) return true
  }
  return false
}

export type ServerVersionRow = {
  updated_at: string
  synced_at?: string | null
}

/**
 * Chuẩn hóa row nhận từ server: synced_at := updated_at (string NGUYÊN VĂN từ PostgREST).
 * Đây là nguồn duy nhất của baseline optimistic-lock. KHÔNG đi qua new Date() (mất microsecond).
 * CHỈ áp cho nhánh authenticated — row local-mode giữ synced_at null.
 */
export function acceptServerRow<T extends { updated_at: string; synced_at?: string | null }>(
  row: T,
): T {
  return { ...row, synced_at: row.updated_at }
}

/**
 * Baseline cho bbq_update_*_if_current: sau chuẩn hóa acceptServerRow, synced_at LUÔN là
 * server updated_at last-seen — dùng thẳng cho cả row sạch lẫn dirty.
 * null → chưa từng có bản server (local-mode / chưa push) → plain update, không guard.
 */
export function expectedServerUpdatedAt(row: ServerVersionRow): string | null {
  return row.synced_at ?? null
}

/**
 * Timestamp cho edit offline: luôn LỚN HƠN updated_at/synced_at hiện có ít nhất 1ms —
 * client clock chậm hơn server không làm edit trông "sạch" (mất push).
 */
export function nextLocalUpdatedAt(row: { updated_at: string; synced_at?: string | null }): string {
  const floor =
    Math.max(
      new Date(row.updated_at).getTime(),
      row.synced_at ? new Date(row.synced_at).getTime() : 0,
    ) + 1
  return new Date(Math.max(Date.now(), floor)).toISOString()
}

export const BBQ_CONFLICT_BACKUPS_KEY = 'bbqone_conflict_backups'
const CONFLICT_BACKUPS_MAX = 20

/** Bản local thua conflict (server-wins nền) — giữ lại để không mất dữ liệu im lặng. */
export async function stashConflictBackup(kind: string, row: unknown): Promise<void> {
  try {
    const chunk = await chrome.storage.local.get(BBQ_CONFLICT_BACKUPS_KEY)
    const raw = chunk[BBQ_CONFLICT_BACKUPS_KEY]
    const list = Array.isArray(raw) ? raw : []
    list.unshift({ kind, row, at: new Date().toISOString() })
    await chrome.storage.local.set({
      [BBQ_CONFLICT_BACKUPS_KEY]: list.slice(0, CONFLICT_BACKUPS_MAX),
    })
  } catch {
    /* best-effort */
  }
}

export type OptimisticUpdateOptions = {
  /** Local row — dùng merge field + derive expected baseline. */
  row?: ServerVersionRow
  /** Override baseline (hiếm khi cần). */
  expectedServerUpdatedAt?: string
  /** UI edit trực tiếp: conflict → refetch server row, retry 1 lần với baseline mới (user intent thắng). */
  retryOnConflictWithServerState?: boolean
}

export function resolveExpectedServerUpdatedAt(
  options?: OptimisticUpdateOptions,
): string | null {
  if (!C9_OPTIMISTIC_RPC_ENABLED) return null
  if (!options) return null
  if (options.expectedServerUpdatedAt) return options.expectedServerUpdatedAt
  if (options.row) return expectedServerUpdatedAt(options.row)
  return null
}

export function throwIfSyncConflict(error: { code?: string; message?: string } | null): void {
  if (error && isSyncConflictError(error)) {
    throw new SyncConflictError(error.message)
  }
}
