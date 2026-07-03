import {
  FOLDERS_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  NOTES_CACHE_KEY,
} from '@/constants/storage'
import { CALENDAR_EVENTS_CACHE_KEY } from '@/constants/calendar'
import type { Folder, Note, NoteBody } from '@/types'
import type { CalendarEvent } from '@/types/calendar'
import { encryptField, isEncryptedEnvelope } from '@/utils/secureCrypto'
import { calendarEventsService } from './calendarEvents.service'
import { noteBodiesService } from './noteBodies.service'
import { notesService } from './notes.service'
import { isAuthenticated } from './localFirst/authMode'
import { isSyncConflictError, stashConflictBackup } from '@/utils/syncConflict'

export function isNoteDirty(n: Note): boolean {
  if (!n.synced_at) return true
  return new Date(n.updated_at) > new Date(n.synced_at)
}

export function isCalendarEventDirty(e: CalendarEvent): boolean {
  if (!e.synced_at) return true
  return new Date(e.updated_at) > new Date(e.synced_at)
}

/** Cùng logic isNoteDirty/isCalendarEventDirty nhưng structural — dùng được cho Note | NoteBody | CalendarEvent. */
export function isRowDirty(row: { updated_at: string; synced_at?: string | null }): boolean {
  if (!row.synced_at) return true
  return new Date(row.updated_at) > new Date(row.synced_at)
}

/**
 * Trộn dữ liệu fetch được (server, hoặc local-first store khi anonymous) với state hiện tại:
 * - row local DIRTY thắng row fresh cùng id (edit offline chưa push không bị đè)
 * - row local DIRTY không còn trong fresh vẫn được GIỮ (chờ push lại — bắt buộc cho scenario C
 *   khi fresh là mảng rỗng của anonymous mode)
 * - row local sạch → fresh thắng (giữ nguyên hành vi pull hiện tại)
 */
export function mergeFreshWithDirtyLocal<T extends { id: string }>(
  fresh: T[],
  local: T[],
  isDirty: (row: T) => boolean,
): T[] {
  const dirtyById = new Map<string, T>()
  for (const row of local) {
    if (isDirty(row)) dirtyById.set(row.id, row)
  }
  if (dirtyById.size === 0) return fresh
  const freshIds = new Set(fresh.map((r) => r.id))
  const merged = fresh.map((row) => dirtyById.get(row.id) ?? row)
  for (const row of local) {
    if (dirtyById.has(row.id) && !freshIds.has(row.id)) merged.push(row)
  }
  return merged
}

function bodiesForNoteSorted(all: NoteBody[], noteId: string): NoteBody[] {
  return all
    .filter((b) => b.note_id === noteId)
    .slice()
    .sort((a, b) => a.position - b.position)
}

export const syncService = {
  /** Push dirty notes + bodies; getKey trả về null khi locked (SW không có key). */
  async syncDirtyNotesFromList(
    notes: Note[],
    noteBodies: NoteBody[],
    folders: Folder[],
    getKey: (folderId: string) => CryptoKey | null,
  ): Promise<number> {
    const byId = new Map(folders.map((f) => [f.id, f]))
    const dirtyBodyNoteIds = new Set(
      noteBodies.filter(isRowDirty).map((b) => b.note_id),
    )
    const candidates = notes.filter((n) => isNoteDirty(n) || dirtyBodyNoteIds.has(n.id))
    let count = 0
    const ts = new Date().toISOString()
    for (const n of candidates) {
      const folder = n.folder_id ? byId.get(n.folder_id) : undefined
      const key = n.folder_id ? getKey(n.folder_id) : null
      const bodies = bodiesForNoteSorted(noteBodies, n.id)
      if (folder?.is_secure) {
        const titlePlain = !isEncryptedEnvelope(n.title)
        const anyBodyPlain = bodies.some(
          (b) =>
            !isEncryptedEnvelope(b.label) || !isEncryptedEnvelope(b.content),
        )
        if ((titlePlain || anyBodyPlain) && !key) {
          continue
        }
      }

      if (isNoteDirty(n)) {
        try {
          let title = n.title
          if (folder?.is_secure && key) {
            if (!isEncryptedEnvelope(title)) title = await encryptField(title, key)
          }
          const savedNote = await notesService.update(
            n.id,
            {
              title,
              folder_id: n.folder_id,
              tags: n.tags,
              synced_at: ts,
            },
            { row: n },
          )
          n.updated_at = savedNote.updated_at
          n.synced_at = savedNote.synced_at
          count++
        } catch (e) {
          if (isSyncConflictError(e)) {
            await stashConflictBackup('note', n)
            n.synced_at = n.updated_at
            count++
          } else {
            continue
          }
        }
      }

      for (const b of bodies) {
        if (!isRowDirty(b)) continue
        try {
          let label = b.label
          let content = b.content
          if (folder?.is_secure && key) {
            if (!isEncryptedEnvelope(label)) label = await encryptField(label, key)
            if (!isEncryptedEnvelope(content)) {
              content = await encryptField(content, key)
            }
          }
          const savedBody = await noteBodiesService.update(
            b.id,
            {
              label,
              content,
              synced_at: ts,
            },
            { row: b },
          )
          b.updated_at = savedBody.updated_at
          b.synced_at = savedBody.synced_at
          count++
        } catch (e) {
          if (isSyncConflictError(e)) {
            await stashConflictBackup('note_body', b)
            b.synced_at = b.updated_at
            count++
            continue
          }
          break
        }
      }
    }
    return count
  },

  /** Push dirty calendar events (created_offline/updated_offline) lên cloud. */
  async syncDirtyCalendarEventsFromList(events: CalendarEvent[]): Promise<number> {
    const dirty = events.filter(isCalendarEventDirty)
    let count = 0
    const ts = new Date().toISOString()
    for (const ev of dirty) {
      try {
        const saved = await calendarEventsService.update(
          ev.id,
          {
            title: ev.title,
            description: ev.description,
            event_date: ev.event_date,
            is_done: ev.is_done,
            position: ev.position,
            color: ev.color,
            synced_at: ts,
          },
          { row: ev },
        )
        ev.updated_at = saved.updated_at
        ev.synced_at = saved.synced_at
        count++
      } catch (e) {
        if (isSyncConflictError(e)) {
          await stashConflictBackup('calendar', ev)
          ev.synced_at = ev.updated_at
          count++
        }
        /* network / lỗi khác: skip, retry lần sau */
      }
    }
    return count
  },

  /**
   * Service worker: đọc cache, push dirty (bỏ qua note secure plaintext nếu không có key).
   * Chỉ chạy khi đã đăng nhập — anonymous mode không có cloud để push lên.
   */
  async syncFromCache(): Promise<number> {
    if (!(await isAuthenticated())) return 0
    const {
      [NOTES_CACHE_KEY]: raw,
      [FOLDERS_CACHE_KEY]: foldersRaw,
      [NOTE_BODIES_CACHE_KEY]: bodiesRaw,
      [CALENDAR_EVENTS_CACHE_KEY]: calRaw,
    } = await chrome.storage.local.get([
      NOTES_CACHE_KEY,
      FOLDERS_CACHE_KEY,
      NOTE_BODIES_CACHE_KEY,
      CALENDAR_EVENTS_CACHE_KEY,
    ])
    const notes = Array.isArray(raw) ? (raw as Note[]) : []
    const folders = Array.isArray(foldersRaw) ? (foldersRaw as Folder[]) : []
    const noteBodies = Array.isArray(bodiesRaw) ? (bodiesRaw as NoteBody[]) : []
    const calendarEvents = Array.isArray(calRaw) ? (calRaw as CalendarEvent[]) : []

    let count = 0
    if (notes.length > 0) {
      count += await this.syncDirtyNotesFromList(
        notes,
        noteBodies,
        folders,
        () => null,
      )
    }
    if (calendarEvents.length > 0) {
      count += await this.syncDirtyCalendarEventsFromList(calendarEvents)
    }

    if (count === 0) return 0

    try {
      const [freshNotes, freshBodies, freshCalendar] = await Promise.all([
        notesService.getAll(),
        noteBodiesService.getAll(),
        calendarEventsService.getAll(),
      ])
      await chrome.storage.local.set({
        [NOTES_CACHE_KEY]: mergeFreshWithDirtyLocal(freshNotes, notes, isRowDirty),
        [NOTE_BODIES_CACHE_KEY]: mergeFreshWithDirtyLocal(freshBodies, noteBodies, isRowDirty),
        [CALENDAR_EVENTS_CACHE_KEY]: mergeFreshWithDirtyLocal(
          freshCalendar,
          calendarEvents,
          isRowDirty,
        ),
      })
    } catch {
      /* offline */
    }
    return count
  },
}
