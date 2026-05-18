/**
 * Local-first types: same shape as cloud entities but without user_id,
 * with `id` as local UUID (crypto.randomUUID), and a `__synced` flag.
 * Dùng cho anonymous mode khi chưa đăng nhập.
 */

import type { Note, NoteBody, Folder } from '@/types'
import type { BookmarkBackup } from '@/types/bookmark'
import type { CalendarEvent } from '@/types/calendar'

/** Local note: thiếu user_id, có local UUID id */
export type LocalNote = Omit<Note, 'user_id'> & {
  /** Local-only flag — đánh dấu entry đã push lên cloud chưa */
  __synced?: boolean
}

export type LocalNoteBody = Omit<NoteBody, 'user_id'> & {
  __synced?: boolean
}

export type LocalFolder = Omit<Folder, 'user_id'> & {
  __synced?: boolean
}

/** LocalBookmark dựa trên BookmarkBackup (không có user_id) */
export type LocalBookmark = Omit<BookmarkBackup, 'user_id'> & {
  __synced?: boolean
}

export type LocalCalendarEvent = Omit<CalendarEvent, 'user_id'> & {
  __synced?: boolean
}

/** Kết quả của một lần sync — dùng cho toast/notification */
export interface SyncResult {
  pushedNotes: number
  pushedNoteBodies: number
  pushedFolders: number
  pushedBookmarks: number
  pushedCalendarEvents: number
  errors: Array<{ entity: string; id: string; error: string }>
  durationMs: number
  cancelled?: boolean // user chọn Cancel trong conflict dialog
  keptCloud?: boolean // user chọn "Use Cloud" → giữ cloud, clear local
}

/** Storage key constants cho chrome.storage.local */
export const LOCAL_STORAGE_KEYS = {
  notes: 'bbqone_local_notes',
  noteBodies: 'bbqone_local_note_bodies',
  folders: 'bbqone_local_folders',
  bookmarks: 'bbqone_local_bookmarks',
  calendarEvents: 'bbqone_local_calendar_events',
  metadata: 'bbqone_local_metadata',
} as const
