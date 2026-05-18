import { localStore } from './localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type { LocalNote, LocalBookmark, LocalCalendarEvent } from '@/types/localFirst'

/** Giữ shape cho SyncConflictDialog — hiện không còn nhánh conflict chi tiết (đã gỡ dictionary). */
export interface ConflictItem {
  entity: 'note' | 'bookmark'
  identifier: string
  localValue: string
  cloudValue: string
  localUpdatedAt: string
  cloudUpdatedAt: string
}

export interface ConflictReport {
  totalLocal: number
  totalConflicts: number
  conflicts: ConflictItem[]
  hasMore: boolean
}

/**
 * Đếm mục local chờ đồng bộ (anonymous). Không còn so khớp conflict client-side trước login.
 */
export async function detectSyncConflicts(): Promise<ConflictReport> {
  const localNotes = await localStore.getArray<LocalNote>(LOCAL_STORAGE_KEYS.notes)
  const localBookmarks = await localStore.getArray<LocalBookmark>(LOCAL_STORAGE_KEYS.bookmarks)
  const localCalendar = await localStore.getArray<LocalCalendarEvent>(
    LOCAL_STORAGE_KEYS.calendarEvents,
  )
  const totalLocal = localNotes.length + localBookmarks.length + localCalendar.length

  return {
    totalLocal,
    totalConflicts: 0,
    conflicts: [],
    hasMore: false,
  }
}
