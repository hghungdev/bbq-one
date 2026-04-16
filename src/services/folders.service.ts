import { supabase } from './supabase'
import type { Folder } from '@/types'

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
      .order('position', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async create(name: string, position: number): Promise<Folder> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('folders')
      .insert({ name, position, user_id: userId })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(
    id: string,
    updates: Partial<Pick<Folder, 'name' | 'position'>>,
  ): Promise<Folder> {
    const { data, error } = await supabase
      .from('folders')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
