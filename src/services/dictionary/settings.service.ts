import { supabase } from '@/services/supabase'
import type { TranslationSettings } from '@/types/dictionary'
import { USE_MYMEMORY_KEY } from '@/constants/storage'

const DEFAULT_SETTINGS: Omit<TranslationSettings, 'user_id' | 'created_at' | 'updated_at'> = {
  native_language: 'vi',
  learning_languages: ['en'],
  default_provider: 'chrome-local',
  auto_detect: true,
  auto_save: false,
  domain_overrides: {},
  use_mymemory: true,
}

async function requireUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not authenticated')
  return user.id
}

/** Sync use_mymemory preference sang chrome.storage.local để accessible ở mọi context */
async function syncUseMyMemoryToLocal(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [USE_MYMEMORY_KEY]: value })
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
    if (data) {
      const settings = data as TranslationSettings
      // Sync use_mymemory preference sang chrome.storage.local
      await syncUseMyMemoryToLocal(settings.use_mymemory ?? true)
      return settings
    }

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
    const settings = data as TranslationSettings
    // Nếu use_mymemory thay đổi, sync sang local
    if ('use_mymemory' in updates) {
      await syncUseMyMemoryToLocal(settings.use_mymemory ?? true)
    }
    return settings
  },
}
