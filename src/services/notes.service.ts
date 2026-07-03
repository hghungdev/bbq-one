import { supabase } from './supabase'
import { noteBodiesService } from './noteBodies.service'
import type { Note, NoteBody } from '@/types'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { localNotesService } from '@/services/localFirst/localNotes.service'
import {
  type OptimisticUpdateOptions,
  resolveExpectedServerUpdatedAt,
  throwIfSyncConflict,
} from '@/utils/syncConflict'

export const notesService = {
  async getAll(): Promise<Note[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data ?? []
    }

    // Local mode
    const arr = await localNotesService.getAll()
    return arr
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((n) => ({ ...n, user_id: '' }) as Note)
  },

  async create(note: Pick<Note, 'title' | 'folder_id' | 'tags'>): Promise<Note> {
    if (await isAuthenticated()) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('notes')
        .insert({
          title: note.title,
          folder_id: note.folder_id,
          tags: note.tags,
          user_id: user.id,
        })
        .select()
        .single()
      if (error) throw error
      return data
    }

    // Local mode
    const local = await localNotesService.create(note)
    return { ...local, user_id: '' } as Note
  },

  async update(
    id: string,
    updates: Partial<Pick<Note, 'title' | 'folder_id' | 'tags' | 'synced_at'>>,
    options?: OptimisticUpdateOptions & { row?: Pick<Note, 'title' | 'folder_id' | 'tags' | 'updated_at' | 'synced_at'> },
  ): Promise<Note> {
    if (await isAuthenticated()) {
      const expected = resolveExpectedServerUpdatedAt(options)
      const base = options?.row
      if (expected !== null && base) {
        const { data, error } = await supabase.rpc('bbq_update_note_if_current', {
          p_id: id,
          p_expected_updated_at: expected,
          p_title: updates.title ?? base.title,
          p_folder_id: updates.folder_id !== undefined ? updates.folder_id : base.folder_id,
          p_tags: updates.tags ?? base.tags,
          p_synced_at: updates.synced_at ?? base.synced_at ?? new Date().toISOString(),
        })
        throwIfSyncConflict(error)
        if (error) throw error
        return data as Note
      }
      const { data, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    }

    // Local mode
    const local = await localNotesService.update(id, updates)
    return { ...local, user_id: '' } as Note
  },

  async delete(id: string): Promise<void> {
    if (await isAuthenticated()) {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
      await localNotesService.delete(id)
      return
    }
    await localNotesService.delete(id)
  },

  /**
   * Full-text search: title/tags trên notes + label/content trên note_bodies.
   * Cloud: FTS với fallback substring. Local: substring search.
   */
  async searchFullText(query: string): Promise<Note[]> {
    const q = query.trim()
    if (!q) return notesService.getAll()

    if (await isAuthenticated()) {
      const { data: titleRows, error: errTitle } = await supabase
        .from('notes')
        .select('*')
        .textSearch('fts', q, { type: 'plain', config: 'english' })
        .order('updated_at', { ascending: false })

      const { data: bodyIdRows, error: errBody } = await supabase
        .from('note_bodies')
        .select('note_id')
        .textSearch('fts', q, { type: 'plain', config: 'english' })

      if (errTitle || errBody) {
        const all = await notesService.getAll()
        const bodies = await noteBodiesService.getAll()
        return filterNotesBySubstring(all, bodies, q)
      }

      const ids = new Set<string>()
      for (const n of titleRows ?? []) ids.add(n.id)
      for (const b of bodyIdRows ?? []) ids.add(b.note_id)

      if (ids.size === 0) {
        const all = await notesService.getAll()
        const bodies = await noteBodiesService.getAll()
        return filterNotesBySubstring(all, bodies, q)
      }

      const idList = [...ids]
      const { data: merged, error: errIn } = await supabase
        .from('notes')
        .select('*')
        .in('id', idList)
        .order('updated_at', { ascending: false })

      if (errIn) {
        const all = await notesService.getAll()
        const bodies = await noteBodiesService.getAll()
        return filterNotesBySubstring(all, bodies, q)
      }
      return merged ?? []
    }

    // Local mode: substring search
    const allNotes = await notesService.getAll()
    const allBodies = await noteBodiesService.getAll()
    return filterNotesBySubstring(allNotes, allBodies, q)
  },
}

/** Lọc title/tags + nội dung body (substring). Dùng chung API + store. */
export function filterNotesBySubstring(
  notes: Note[],
  bodies: NoteBody[],
  query: string,
): Note[] {
  const lower = query.trim().toLowerCase()
  if (!lower) return []
  const byNote = new Map<string, NoteBody[]>()
  for (const b of bodies) {
    const list = byNote.get(b.note_id) ?? []
    list.push(b)
    byNote.set(b.note_id, list)
  }
  return notes.filter((n) => {
    if (n.title.toLowerCase().includes(lower)) return true
    if (n.tags.some((t) => t.toLowerCase().includes(lower))) return true
    const bs = byNote.get(n.id) ?? []
    for (const b of bs) {
      if (b.label.toLowerCase().includes(lower)) return true
      if (b.content.toLowerCase().includes(lower)) return true
    }
    return false
  })
}
