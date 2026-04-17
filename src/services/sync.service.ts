import {
  FOLDERS_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  NOTES_CACHE_KEY,
} from '@/constants/storage'
import type { Folder, Note, NoteBody } from '@/types'
import { encryptField, isEncryptedEnvelope } from '@/utils/secureCrypto'
import { noteBodiesService } from './noteBodies.service'
import { notesService } from './notes.service'

export function isNoteDirty(n: Note): boolean {
  if (!n.synced_at) return true
  return new Date(n.updated_at) > new Date(n.synced_at)
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
    const dirty = notes.filter(isNoteDirty)
    let count = 0
    const ts = new Date().toISOString()
    for (const n of dirty) {
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
      for (const b of bodies) {
        let label = b.label
        let content = b.content
        if (folder?.is_secure && key) {
          if (!isEncryptedEnvelope(label)) label = await encryptField(label, key)
          if (!isEncryptedEnvelope(content)) {
            content = await encryptField(content, key)
          }
        }
        await noteBodiesService.update(b.id, {
          label,
          content,
          synced_at: ts,
        })
      }
      let title = n.title
      if (folder?.is_secure && key) {
        if (!isEncryptedEnvelope(title)) title = await encryptField(title, key)
      }
      await notesService.update(n.id, {
        title,
        folder_id: n.folder_id,
        tags: n.tags,
        synced_at: ts,
      })
      count++
    }
    return count
  },

  /**
   * Service worker: đọc cache, push dirty (bỏ qua note secure plaintext nếu không có key).
   */
  async syncFromCache(): Promise<number> {
    const { [NOTES_CACHE_KEY]: raw, [FOLDERS_CACHE_KEY]: foldersRaw, [NOTE_BODIES_CACHE_KEY]: bodiesRaw } =
      await chrome.storage.local.get([
        NOTES_CACHE_KEY,
        FOLDERS_CACHE_KEY,
        NOTE_BODIES_CACHE_KEY,
      ])
    const notes = Array.isArray(raw) ? (raw as Note[]) : []
    const folders = Array.isArray(foldersRaw) ? (foldersRaw as Folder[]) : []
    const noteBodies = Array.isArray(bodiesRaw) ? (bodiesRaw as NoteBody[]) : []
    if (notes.length === 0) return 0
    const count = await this.syncDirtyNotesFromList(
      notes,
      noteBodies,
      folders,
      () => null,
    )
    try {
      const [freshNotes, freshBodies] = await Promise.all([
        notesService.getAll(),
        noteBodiesService.getAll(),
      ])
      await chrome.storage.local.set({
        [NOTES_CACHE_KEY]: freshNotes,
        [NOTE_BODIES_CACHE_KEY]: freshBodies,
      })
    } catch {
      /* offline */
    }
    return count
  },
}
