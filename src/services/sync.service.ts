import { FOLDERS_CACHE_KEY, NOTES_CACHE_KEY } from '@/constants/storage'
import type { Folder, Note } from '@/types'
import { encryptField, isEncryptedEnvelope } from '@/utils/secureCrypto'
import { notesService } from './notes.service'

export function isNoteDirty(n: Note): boolean {
  if (!n.synced_at) return true
  return new Date(n.updated_at) > new Date(n.synced_at)
}

export const syncService = {
  /** Push dirty notes; getKey trả về null khi locked (SW không có key). */
  async syncDirtyNotesFromList(
    notes: Note[],
    folders: Folder[],
    getKey: (folderId: string) => CryptoKey | null,
  ): Promise<number> {
    const byId = new Map(folders.map((f) => [f.id, f]))
    const dirty = notes.filter(isNoteDirty)
    let count = 0
    for (const n of dirty) {
      const folder = n.folder_id ? byId.get(n.folder_id) : undefined
      const key = n.folder_id ? getKey(n.folder_id) : null
      if (folder?.is_secure) {
        const plaintext =
          !isEncryptedEnvelope(n.title) || !isEncryptedEnvelope(n.content)
        if (plaintext && !key) {
          continue
        }
      }
      let title = n.title
      let content = n.content
      if (folder?.is_secure && key) {
        if (!isEncryptedEnvelope(title)) title = await encryptField(title, key)
        if (!isEncryptedEnvelope(content)) {
          content = await encryptField(content, key)
        }
      }
      await notesService.update(n.id, {
        title,
        content,
        folder_id: n.folder_id,
        tags: n.tags,
        synced_at: new Date().toISOString(),
      })
      count++
    }
    return count
  },

  /**
   * Service worker: đọc cache, push dirty (bỏ qua note secure plaintext nếu không có key).
   */
  async syncFromCache(): Promise<number> {
    const { [NOTES_CACHE_KEY]: raw, [FOLDERS_CACHE_KEY]: foldersRaw } =
      await chrome.storage.local.get([NOTES_CACHE_KEY, FOLDERS_CACHE_KEY])
    const notes = Array.isArray(raw) ? (raw as Note[]) : []
    const folders = Array.isArray(foldersRaw) ? (foldersRaw as Folder[]) : []
    if (notes.length === 0) return 0
    const count = await this.syncDirtyNotesFromList(notes, folders, () => null)
    try {
      const fresh = await notesService.getAll()
      await chrome.storage.local.set({ [NOTES_CACHE_KEY]: fresh })
    } catch {
      /* offline */
    }
    return count
  },
}
