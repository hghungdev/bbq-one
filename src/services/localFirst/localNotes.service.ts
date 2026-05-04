import { localStore } from './localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type { LocalNote, LocalNoteBody, LocalFolder } from '@/types/localFirst'
import type { Note, NoteBody, Folder } from '@/types'
import { DEFAULT_PBKDF2_ITERATIONS } from '@/utils/secureCrypto'

// ─── Notes ───────────────────────────────────────────────────────────────────

export const localNotesService = {
  async getAll(): Promise<LocalNote[]> {
    return localStore.getArray<LocalNote>(LOCAL_STORAGE_KEYS.notes)
  },

  async create(input: Pick<Note, 'title' | 'folder_id' | 'tags'>): Promise<LocalNote> {
    const now = new Date().toISOString()
    const note: LocalNote = {
      id: crypto.randomUUID(),
      title: input.title,
      folder_id: input.folder_id,
      tags: input.tags ?? [],
      created_at: now,
      updated_at: now,
      synced_at: null,
      __synced: false,
    }
    await localStore.pushItem(LOCAL_STORAGE_KEYS.notes, note)
    return note
  },

  async update(
    id: string,
    updates: Partial<Pick<Note, 'title' | 'folder_id' | 'tags' | 'synced_at'>>,
  ): Promise<LocalNote> {
    const arr = await this.getAll()
    const idx = arr.findIndex((n) => n.id === id)
    if (idx < 0) throw new Error('Note not found in local store')
    arr[idx] = {
      ...arr[idx],
      ...updates,
      updated_at: new Date().toISOString(),
      __synced: false,
    }
    await localStore.setArray(LOCAL_STORAGE_KEYS.notes, arr)
    return arr[idx]
  },

  async delete(id: string): Promise<void> {
    const notes = await this.getAll()
    await localStore.setArray(
      LOCAL_STORAGE_KEYS.notes,
      notes.filter((n) => n.id !== id),
    )
    // Cascade: xóa note_bodies thuộc note này
    const bodies = await localStore.getArray<LocalNoteBody>(LOCAL_STORAGE_KEYS.noteBodies)
    await localStore.setArray(
      LOCAL_STORAGE_KEYS.noteBodies,
      bodies.filter((b) => b.note_id !== id),
    )
  },

  async pendingSyncCount(): Promise<number> {
    const arr = await this.getAll()
    return arr.filter((n) => !n.__synced).length
  },
}

// ─── Note Bodies ─────────────────────────────────────────────────────────────

export const localNoteBodiesService = {
  async getAll(): Promise<LocalNoteBody[]> {
    const arr = await localStore.getArray<LocalNoteBody>(LOCAL_STORAGE_KEYS.noteBodies)
    return [...arr].sort((a, b) =>
      a.note_id.localeCompare(b.note_id) || a.position - b.position,
    )
  },

  async listByNoteId(noteId: string): Promise<LocalNoteBody[]> {
    const all = await this.getAll()
    return all.filter((b) => b.note_id === noteId)
  },

  async create(
    noteId: string,
    row: Pick<NoteBody, 'label' | 'content' | 'position'>,
  ): Promise<LocalNoteBody> {
    const now = new Date().toISOString()
    const body: LocalNoteBody = {
      id: crypto.randomUUID(),
      note_id: noteId,
      label: row.label,
      content: row.content,
      position: row.position,
      synced_at: null,
      created_at: now,
      updated_at: now,
      __synced: false,
    }
    await localStore.pushItem(LOCAL_STORAGE_KEYS.noteBodies, body)
    return body
  },

  async update(
    id: string,
    updates: Partial<Pick<NoteBody, 'label' | 'content' | 'position' | 'synced_at'>>,
  ): Promise<LocalNoteBody> {
    const arr = await localStore.getArray<LocalNoteBody>(LOCAL_STORAGE_KEYS.noteBodies)
    const idx = arr.findIndex((b) => b.id === id)
    if (idx < 0) throw new Error('NoteBody not found in local store')
    arr[idx] = {
      ...arr[idx],
      ...updates,
      updated_at: new Date().toISOString(),
      __synced: false,
    }
    await localStore.setArray(LOCAL_STORAGE_KEYS.noteBodies, arr)
    return arr[idx]
  },

  async delete(id: string): Promise<void> {
    const arr = await localStore.getArray<LocalNoteBody>(LOCAL_STORAGE_KEYS.noteBodies)
    await localStore.setArray(
      LOCAL_STORAGE_KEYS.noteBodies,
      arr.filter((b) => b.id !== id),
    )
  },
}

// ─── Folders ─────────────────────────────────────────────────────────────────

export const localFoldersService = {
  async getAll(): Promise<LocalFolder[]> {
    const arr = await localStore.getArray<LocalFolder>(LOCAL_STORAGE_KEYS.folders)
    return [...arr].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  },

  async create(name: string, position: number): Promise<LocalFolder> {
    const now = new Date().toISOString()
    const folder: LocalFolder = {
      id: crypto.randomUUID(),
      name,
      position,
      // Secure folder không hỗ trợ ở local mode — luôn false
      is_secure: false,
      secure_salt: null,
      pbkdf2_iterations: DEFAULT_PBKDF2_ITERATIONS,
      secure_verifier_enc: null,
      created_at: now,
      updated_at: now,
      __synced: false,
    }
    await localStore.pushItem(LOCAL_STORAGE_KEYS.folders, folder)
    return folder
  },

  async update(
    id: string,
    updates: Partial<
      Pick<
        Folder,
        | 'name'
        | 'position'
        | 'is_secure'
        | 'secure_salt'
        | 'pbkdf2_iterations'
        | 'secure_verifier_enc'
      >
    >,
  ): Promise<LocalFolder> {
    const arr = await localStore.getArray<LocalFolder>(LOCAL_STORAGE_KEYS.folders)
    const idx = arr.findIndex((f) => f.id === id)
    if (idx < 0) throw new Error('Folder not found in local store')
    arr[idx] = {
      ...arr[idx],
      ...updates,
      updated_at: new Date().toISOString(),
      __synced: false,
    }
    await localStore.setArray(LOCAL_STORAGE_KEYS.folders, arr)
    return arr[idx]
  },

  async delete(id: string): Promise<void> {
    const arr = await localStore.getArray<LocalFolder>(LOCAL_STORAGE_KEYS.folders)
    await localStore.setArray(
      LOCAL_STORAGE_KEYS.folders,
      arr.filter((f) => f.id !== id),
    )
  },
}
