import { supabase } from '@/services/supabase'
import { getCurrentUserId } from './authMode'
import { localStore } from './localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type {
  LocalNote,
  LocalNoteBody,
  LocalFolder,
  LocalBookmark,
  LocalCalendarEvent,
  SyncResult,
} from '@/types/localFirst'
import { detectSyncConflicts } from './conflictDetector'
import type { ConflictReport } from './conflictDetector'

export type SyncStrategy = 'use-local' | 'use-cloud' | 'cancel'

export { type ConflictReport }

/**
 * Pre-flight check trước khi sync.
 * Returns conflict report để UI có thể show dialog.
 */
export async function prepareSyncWithConflictCheck(): Promise<ConflictReport> {
  return detectSyncConflicts()
}

/**
 * Push toàn bộ local data lên cloud sau khi user đăng nhập.
 * - Idempotent: an toàn để gọi nhiều lần (dùng upsert)
 * - Khi thành công hoàn toàn: xóa local storage
 * - Khi partial failure: giữ lại các entry lỗi, clear những entry thành công
 *
 * @param strategy 'use-local' (default) = local overwrites cloud | 'use-cloud' = clear local | 'cancel' = no-op
 */
export async function pushLocalToCloud(
  strategy: SyncStrategy = 'use-local',
): Promise<SyncResult> {
  const emptyResult = {
    pushedNotes: 0,
    pushedNoteBodies: 0,
    pushedFolders: 0,
    pushedBookmarks: 0,
    pushedCalendarEvents: 0,
    errors: [],
    durationMs: 0,
  }

  if (strategy === 'cancel') {
    return { ...emptyResult, cancelled: true }
  }

  if (strategy === 'use-cloud') {
    // Phase 1: clear local, giữ nguyên cloud
    await localStore.clearAllLocal()
    return { ...emptyResult, keptCloud: true }
  }

  // strategy === 'use-local' → existing logic (last-write-wins via upsert)
  const startedAt = Date.now()
  const userId = await getCurrentUserId()
  const result: SyncResult = {
    pushedNotes: 0,
    pushedNoteBodies: 0,
    pushedFolders: 0,
    pushedBookmarks: 0,
    pushedCalendarEvents: 0,
    errors: [],
    durationMs: 0,
  }

  // Track IDs thành công để mark synced hoặc clear sau
  const syncedFolderIds = new Set<string>()
  const syncedNoteIds = new Set<string>()
  const syncedBodyIds = new Set<string>()
  const syncedBookmarkIds = new Set<string>()
  const syncedCalendarIds = new Set<string>()

  // 1. Folders trước (notes reference folders)
  const folders = await localStore.getArray<LocalFolder>(LOCAL_STORAGE_KEYS.folders)
  for (const folder of folders) {
    if (folder.__synced) {
      syncedFolderIds.add(folder.id)
      continue
    }
    try {
      const { __synced: _s, ...rest } = folder
      const { error } = await supabase
        .from('folders')
        .upsert({ ...rest, user_id: userId }, { onConflict: 'id' })
      if (error) throw error
      result.pushedFolders++
      syncedFolderIds.add(folder.id)
    } catch (e) {
      result.errors.push({
        entity: 'folder',
        id: folder.id,
        error: (e as Error).message,
      })
    }
  }

  // 2. Notes
  const notes = await localStore.getArray<LocalNote>(LOCAL_STORAGE_KEYS.notes)
  for (const note of notes) {
    if (note.__synced) {
      syncedNoteIds.add(note.id)
      continue
    }
    try {
      const { __synced: _s, ...rest } = note
      const { error } = await supabase
        .from('notes')
        .upsert({ ...rest, user_id: userId }, { onConflict: 'id' })
      if (error) throw error
      result.pushedNotes++
      syncedNoteIds.add(note.id)
    } catch (e) {
      result.errors.push({
        entity: 'note',
        id: note.id,
        error: (e as Error).message,
      })
    }
  }

  // 3. Note bodies
  const bodies = await localStore.getArray<LocalNoteBody>(LOCAL_STORAGE_KEYS.noteBodies)
  for (const body of bodies) {
    if (body.__synced) {
      syncedBodyIds.add(body.id)
      continue
    }
    try {
      const { __synced: _s, ...rest } = body
      const { error } = await supabase
        .from('note_bodies')
        .upsert({ ...rest, user_id: userId }, { onConflict: 'id' })
      if (error) throw error
      result.pushedNoteBodies++
      syncedBodyIds.add(body.id)
    } catch (e) {
      result.errors.push({
        entity: 'note_body',
        id: body.id,
        error: (e as Error).message,
      })
    }
  }

  // 4. Bookmarks (push as unencrypted — user có thể set PIN sau)
  const bookmarks = await localStore.getArray<LocalBookmark>(LOCAL_STORAGE_KEYS.bookmarks)
  for (const bm of bookmarks) {
    if (bm.__synced) {
      syncedBookmarkIds.add(bm.id)
      continue
    }
    try {
      const { __synced: _s, ...rest } = bm
      const { error } = await supabase
        .from('bookmark_backups')
        .upsert(
          { ...rest, user_id: userId, encrypted: false, payload_iv: null, payload_ciphertext: null },
          { onConflict: 'id' },
        )
      if (error) throw error
      result.pushedBookmarks++
      syncedBookmarkIds.add(bm.id)
    } catch (e) {
      result.errors.push({
        entity: 'bookmark',
        id: bm.id,
        error: (e as Error).message,
      })
    }
  }

  // 5. Calendar events
  const calendarEvents = await localStore.getArray<LocalCalendarEvent>(
    LOCAL_STORAGE_KEYS.calendarEvents,
  )
  for (const ev of calendarEvents) {
    if (ev.__synced) {
      syncedCalendarIds.add(ev.id)
      continue
    }
    try {
      const { __synced: _s, ...rest } = ev
      const { error } = await supabase
        .from('calendar_events')
        .upsert({ ...rest, user_id: userId }, { onConflict: 'id' })
      if (error) throw error
      result.pushedCalendarEvents++
      syncedCalendarIds.add(ev.id)
    } catch (e) {
      result.errors.push({
        entity: 'calendar_event',
        id: ev.id,
        error: (e as Error).message,
      })
    }
  }

  // 6. Cleanup
  if (result.errors.length === 0) {
    // Tất cả thành công → clear toàn bộ local data
    await localStore.clearAllLocal()
  } else {
    // Partial success → giữ lại entry lỗi, xóa entry đã sync thành công
    await _clearSyncedEntries(
      syncedFolderIds,
      syncedNoteIds,
      syncedBodyIds,
      syncedBookmarkIds,
      syncedCalendarIds,
    )
  }

  result.durationMs = Date.now() - startedAt
  return result
}

/** Xóa riêng lẻ các entry đã sync thành công, giữ lại entry lỗi để retry sau */
async function _clearSyncedEntries(
  folderIds: Set<string>,
  noteIds: Set<string>,
  bodyIds: Set<string>,
  bookmarkIds: Set<string>,
  calendarIds: Set<string>,
): Promise<void> {
  const [folders, notes, bodies, bookmarks, calEvents] = await Promise.all([
    localStore.getArray<LocalFolder>(LOCAL_STORAGE_KEYS.folders),
    localStore.getArray<LocalNote>(LOCAL_STORAGE_KEYS.notes),
    localStore.getArray<LocalNoteBody>(LOCAL_STORAGE_KEYS.noteBodies),
    localStore.getArray<LocalBookmark>(LOCAL_STORAGE_KEYS.bookmarks),
    localStore.getArray<LocalCalendarEvent>(LOCAL_STORAGE_KEYS.calendarEvents),
  ])

  await Promise.all([
    localStore.setArray(LOCAL_STORAGE_KEYS.folders, folders.filter((f) => !folderIds.has(f.id))),
    localStore.setArray(LOCAL_STORAGE_KEYS.notes, notes.filter((n) => !noteIds.has(n.id))),
    localStore.setArray(LOCAL_STORAGE_KEYS.noteBodies, bodies.filter((b) => !bodyIds.has(b.id))),
    localStore.setArray(LOCAL_STORAGE_KEYS.bookmarks, bookmarks.filter((b) => !bookmarkIds.has(b.id))),
    localStore.setArray(
      LOCAL_STORAGE_KEYS.calendarEvents,
      calEvents.filter((ev) => !calendarIds.has(ev.id)),
    ),
  ])
}

/**
 * Lắng nghe auth state change; trigger sync khi SIGNED_IN.
 * Gọi một lần khi khởi tạo app trong src/App.vue.
 */
export function setupAutoSyncOnLogin(
  onSyncComplete: (result: SyncResult) => void,
  onSyncError: (error: Error) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      try {
        const result = await pushLocalToCloud()
        onSyncComplete(result)
      } catch (error) {
        onSyncError(error as Error)
      }
    }
  })
  return () => data.subscription.unsubscribe()
}
