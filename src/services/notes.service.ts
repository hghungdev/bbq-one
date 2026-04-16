import { supabase } from './supabase'
import type { Note } from '@/types'

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export const notesService = {
  async getAll(): Promise<Note[]> {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async create(
    note: Pick<Note, 'title' | 'content' | 'folder_id' | 'tags'>,
  ): Promise<Note> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('notes')
      .insert({
        title: note.title,
        content: note.content,
        folder_id: note.folder_id,
        tags: note.tags,
        user_id: userId,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(
    id: string,
    updates: Partial<
      Pick<Note, 'title' | 'content' | 'folder_id' | 'tags' | 'synced_at'>
    >,
  ): Promise<Note> {
    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) throw error
  },

  /**
   * Full-text search on generated `fts` column (see supabase/001_notes_fts_column.sql).
   * Falls back to client-side title/content match if FTS is unavailable.
   */
  async searchFullText(query: string): Promise<Note[]> {
    const q = query.trim()
    if (!q) return notesService.getAll()

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .textSearch('fts', q, { type: 'websearch', config: 'english' })
      .order('updated_at', { ascending: false })

    if (error) {
      const all = await notesService.getAll()
      return filterNotesClient(all, q)
    }
    return data ?? []
  },
}

function filterNotesClient(notes: Note[], query: string): Note[] {
  const lower = query.toLowerCase()
  return notes.filter(
    (n) =>
      n.title.toLowerCase().includes(lower) ||
      n.content.toLowerCase().includes(lower),
  )
}
