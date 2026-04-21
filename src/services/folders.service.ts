import { supabase } from './supabase'
import type { Folder } from '@/types'
import { DEFAULT_PBKDF2_ITERATIONS } from '@/utils/secureCrypto'

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

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export const foldersService = {
  async getAll(): Promise<Folder[]> {
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(normalizeFolder)
  },

  async create(name: string, position: number): Promise<Folder> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('folders')
      .insert({ name, position, user_id: userId })
      .select()
      .single()
    if (error) throw error
    return normalizeFolder(data)
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
    const { data, error } = await supabase
      .from('folders')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return normalizeFolder(data)
  },

  async delete(id: string): Promise<void> {
    await requireUserId()
    const { error } = await supabase.from('folders').delete().eq('id', id)
    if (error) throw error
  },
}
