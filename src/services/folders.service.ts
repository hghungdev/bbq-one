import { supabase } from './supabase'
import type { Folder } from '@/types'
import { DEFAULT_PBKDF2_ITERATIONS } from '@/utils/secureCrypto'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { localFoldersService } from '@/services/localFirst/localNotes.service'

function normalizeFolder(row: Folder): Folder {
  return {
    ...row,
    updated_at: row.updated_at ?? row.created_at,
    is_secure: row.is_secure ?? false,
    secure_salt: row.secure_salt ?? null,
    pbkdf2_iterations: row.pbkdf2_iterations ?? DEFAULT_PBKDF2_ITERATIONS,
    secure_verifier_enc: row.secure_verifier_enc ?? null,
  }
}

export const foldersService = {
  async getAll(): Promise<Folder[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(normalizeFolder)
    }

    // Local mode: folders đã được normalize khi tạo
    const arr = await localFoldersService.getAll()
    return arr.map((f) => ({ ...f, user_id: '' }) as Folder)
  },

  async create(name: string, position: number): Promise<Folder> {
    if (await isAuthenticated()) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('folders')
        .insert({ name, position, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      return normalizeFolder(data)
    }

    // Local mode
    const local = await localFoldersService.create(name, position)
    return { ...local, user_id: '' } as Folder
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
  ): Promise<Folder> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('folders')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return normalizeFolder(data)
    }

    // Local mode
    const local = await localFoldersService.update(id, updates)
    return { ...local, user_id: '' } as Folder
  },

  async delete(id: string): Promise<void> {
    if (await isAuthenticated()) {
      const { error } = await supabase.from('folders').delete().eq('id', id)
      if (error) throw error
      return
    }
    await localFoldersService.delete(id)
  },
}
