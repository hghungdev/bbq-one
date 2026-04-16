import { NOTES_CACHE_KEY } from '@/constants/storage'
import type { Note } from '@/types'
import { notesService } from './notes.service'

export function isNoteDirty(n: Note): boolean {
  if (!n.synced_at) return true
  return new Date(n.updated_at) > new Date(n.synced_at)
}

export const syncService = {
  /** Push dirty notes from an in-memory list (popup / Pinia). */
  async syncDirtyNotesFromList(notes: Note[]): Promise<number> {
    const dirty = notes.filter(isNoteDirty)
    let count = 0
    for (const n of dirty) {
      await notesService.update(n.id, {
        title: n.title,
        content: n.content,
        folder_id: n.folder_id,
        tags: n.tags,
        synced_at: new Date().toISOString(),
      })
      count++
    }
    return count
  },

  /**
   * Service worker: read cached notes, push dirty rows, then refresh cache from API when online.
   */
  async syncFromCache(): Promise<number> {
    const { [NOTES_CACHE_KEY]: raw } = await chrome.storage.local.get(NOTES_CACHE_KEY)
    const notes = Array.isArray(raw) ? (raw as Note[]) : []
    if (notes.length === 0) return 0
    const count = await this.syncDirtyNotesFromList(notes)
    try {
      const fresh = await notesService.getAll()
      await chrome.storage.local.set({ [NOTES_CACHE_KEY]: fresh })
    } catch {
      /* offline: keep existing cache */
    }
    return count
  },
}
