import { supabase } from './supabase'
import type { NoteBody } from '@/types'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { localNoteBodiesService } from '@/services/localFirst/localNotes.service'
import {
  acceptServerRow,
  isSyncConflictError,
  type OptimisticUpdateOptions,
  resolveExpectedServerUpdatedAt,
  throwIfSyncConflict,
} from '@/utils/syncConflict'
import { fetchAllRows } from '@/utils/supabaseFetchAll'

export const noteBodiesService = {
  async getAll(): Promise<NoteBody[]> {
    if (await isAuthenticated()) {
      const data = await fetchAllRows<NoteBody>(() =>
        supabase
          .from('note_bodies')
          .select('*')
          .order('note_id', { ascending: true })
          .order('position', { ascending: true })
          .order('id', { ascending: true }),
      )
      return data.map(acceptServerRow)
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
      return (data ?? []).map(acceptServerRow)
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
      return acceptServerRow(data)
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
        const rpcArgs = (expectedUpdatedAt: string, baseRow: typeof base) => ({
          p_id: id,
          p_expected_updated_at: expectedUpdatedAt,
          p_label: updates.label ?? baseRow.label,
          p_content: updates.content ?? baseRow.content,
          p_synced_at: updates.synced_at ?? baseRow.synced_at ?? new Date().toISOString(),
        })
        let attempt = await supabase.rpc('bbq_update_note_body_if_current', rpcArgs(expected, base))
        if (
          attempt.error
          && isSyncConflictError(attempt.error)
          && options?.retryOnConflictWithServerState
        ) {
          const { data: fresh, error: freshErr } = await supabase
            .from('note_bodies')
            .select('*')
            .eq('id', id)
            .single()
          if (!freshErr && fresh) {
            attempt = await supabase.rpc(
              'bbq_update_note_body_if_current',
              rpcArgs(fresh.updated_at, fresh),
            )
          }
        }
        throwIfSyncConflict(attempt.error)
        if (attempt.error) throw attempt.error
        return acceptServerRow(attempt.data as NoteBody)
      }
      const { data, error } = await supabase
        .from('note_bodies')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return acceptServerRow(data)
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
