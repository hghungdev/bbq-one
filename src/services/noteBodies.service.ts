import { supabase } from './supabase'
import type { NoteBody } from '@/types'

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export const noteBodiesService = {
  async getAll(): Promise<NoteBody[]> {
    const { data, error } = await supabase
      .from('note_bodies')
      .select('*')
      .order('note_id', { ascending: true })
      .order('position', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async listByNoteId(noteId: string): Promise<NoteBody[]> {
    const { data, error } = await supabase
      .from('note_bodies')
      .select('*')
      .eq('note_id', noteId)
      .order('position', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async create(
    noteId: string,
    row: Pick<NoteBody, 'label' | 'content' | 'position'>,
  ): Promise<NoteBody> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('note_bodies')
      .insert({
        note_id: noteId,
        user_id: userId,
        label: row.label,
        content: row.content,
        position: row.position,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(
    id: string,
    updates: Partial<
      Pick<NoteBody, 'label' | 'content' | 'position' | 'synced_at'>
    >,
  ): Promise<NoteBody> {
    const { data, error } = await supabase
      .from('note_bodies')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('note_bodies').delete().eq('id', id)
    if (error) throw error
  },
}
