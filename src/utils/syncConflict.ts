/** Supabase RPC optimistic lock (migration 014) — client helpers. */

/**
 * Tắt tạm (C9 hotfix): baseline synced_at client ≠ server updated_at sau trigger
 * → mọi dirty push BBQ_CONFLICT vĩnh viễn. Bật lại sau C9.1 (synced_at := server updated_at).
 */
export const C9_OPTIMISTIC_RPC_ENABLED = false

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
 * Baseline server `updated_at` for `bbq_update_*_if_current` RPC.
 * null → row chưa có synced_at (chưa push lần nào) → plain `.update()` không guard.
 */
export function expectedServerUpdatedAt(row: ServerVersionRow): string | null {
  if (!row.synced_at) return null
  const dirty = new Date(row.updated_at) > new Date(row.synced_at)
  return dirty ? row.synced_at : row.updated_at
}

export type OptimisticUpdateOptions = {
  /** Local row — dùng merge field + derive expected baseline. */
  row?: ServerVersionRow
  /** Override baseline (hiếm khi cần). */
  expectedServerUpdatedAt?: string
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
