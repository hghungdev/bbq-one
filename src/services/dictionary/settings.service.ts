import { supabase } from '@/services/supabase'
import type { TranslationSettings } from '@/types/dictionary'

const DEFAULT_SETTINGS: Omit<TranslationSettings, 'user_id' | 'created_at' | 'updated_at'> = {
  native_language: 'vi',
  learning_languages: ['en'],
  default_provider: 'chrome-local',
  auto_detect: true,
  auto_save: false,
  domain_overrides: {},
}

async function requireUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export const translationSettingsService = {
  async getOrCreate(): Promise<TranslationSettings> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('user_translation_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    if (data) return data as TranslationSettings

    const { data: created, error: errCreate } = await supabase
      .from('user_translation_settings')
      .insert({ user_id: userId, ...DEFAULT_SETTINGS })
      .select()
      .single()
    if (errCreate) throw errCreate
    return created as TranslationSettings
  },

  async update(
    updates: Partial<Omit<TranslationSettings, 'user_id' | 'created_at' | 'updated_at'>>,
  ): Promise<TranslationSettings> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('user_translation_settings')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) throw error
    return data as TranslationSettings
  },
}
