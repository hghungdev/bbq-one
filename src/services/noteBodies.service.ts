import { supabase } from './supabase'
import type { NoteBody } from '@/types'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { localNoteBodiesService } from '@/services/localFirst/localNotes.service'
import {
  type OptimisticUpdateOptions,
  resolveExpectedServerUpdatedAt,
  throwIfSyncConflict,
} from '@/utils/syncConflict'

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
    options?: OptimisticUpdateOptions & { row?: Pick<NoteBody, 'label' | 'content' | 'position' | 'updated_at' | 'synced_at'> },
  ): Promise<NoteBody> {
    if (await isAuthenticated()) {
      const expected = resolveExpectedServerUpdatedAt(options)
      const base = options?.row
      if (expected !== null && base) {
        const { data, error } = await supabase.rpc('bbq_update_note_body_if_current', {
          p_id: id,
          p_expected_updated_at: expected,
          p_label: updates.label ?? base.label,
          p_content: updates.content ?? base.content,
          p_synced_at: updates.synced_at ?? base.synced_at ?? new Date().toISOString(),
        })
        throwIfSyncConflict(error)
        if (error) throw error
        return data as NoteBody
      }
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
