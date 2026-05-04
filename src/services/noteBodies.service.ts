import { supabase } from './supabase'
import type { NoteBody } from '@/types'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { localNoteBodiesService } from '@/services/localFirst/localNotes.service'

export const noteBodiesService = {
  async getAll(): Promise<NoteBody[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('note_bodies')
        .select('*')
        .order('note_id', { ascending: true })
        .order('position', { ascending: true })
      if (error) throw error
      return data ?? []
    }

    // Local mode
    const arr = await localNoteBodiesService.getAll()
    return arr.map((b) => ({ ...b, user_id: '' }) as NoteBody)
  },

  async listByNoteId(noteId: string): Promise<NoteBody[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('note_bodies')
        .select('*')
        .eq('note_id', noteId)
        .order('position', { ascending: true })
      if (error) throw error
      return data ?? []
    }

    // Local mode
    const arr = await localNoteBodiesService.listByNoteId(noteId)
    return arr.map((b) => ({ ...b, user_id: '' }) as NoteBody)
  },

  async create(
    noteId: string,
    row: Pick<NoteBody, 'label' | 'content' | 'position'>,
  ): Promise<NoteBody> {
    if (await isAuthenticated()) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('note_bodies')
        .insert({
          note_id: noteId,
          user_id: user.id,
          label: row.label,
          content: row.content,
          position: row.position,
        })
        .select()
        .single()
      if (error) throw error
      return data
    }

    // Local mode
    const local = await localNoteBodiesService.create(noteId, row)
    return { ...local, user_id: '' } as NoteBody
  },

  async update(
    id: string,
    updates: Partial<Pick<NoteBody, 'label' | 'content' | 'position' | 'synced_at'>>,
  ): Promise<NoteBody> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('note_bodies')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    }

    // Local mode
    const local = await localNoteBodiesService.update(id, updates)
    return { ...local, user_id: '' } as NoteBody
  },

  async delete(id: string): Promise<void> {
    if (await isAuthenticated()) {
      const { error } = await supabase.from('note_bodies').delete().eq('id', id)
      if (error) throw error
      return
    }
    await localNoteBodiesService.delete(id)
  },
}
