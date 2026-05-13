import { supabase } from '@/services/supabase'
import type { TranslationSettings } from '@/types/dictionary'
import { ANON_TRANSLATION_SETTINGS_KEY, USE_MYMEMORY_KEY } from '@/constants/storage'

const DEFAULT_SETTINGS: Omit<TranslationSettings, 'user_id' | 'created_at' | 'updated_at'> = {
  native_language: 'vi',
  learning_languages: ['en'],
  default_provider: 'chrome-local',
  auto_detect: true,
  auto_save: false,
  domain_overrides: {},
  use_mymemory: true,
}

type AnonTranslationStored = Partial<
  Pick<TranslationSettings, 'native_language' | 'learning_languages' | 'use_mymemory'>
>

/** Dùng session local — tránh supabase.auth.getUser() ném AuthSessionMissingError khi chưa đăng nhập */
async function getSessionUserId(): Promise<string | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error || !session?.user?.id) return null
  return session.user.id
}

async function readUseMyMemoryFromLocalStorage(): Promise<boolean> {
  const raw = await chrome.storage.local.get(USE_MYMEMORY_KEY)
  if (raw[USE_MYMEMORY_KEY] === false) return false
  return true
}

async function readAnonTranslationStored(): Promise<AnonTranslationStored> {
  const raw = await chrome.storage.local.get(ANON_TRANSLATION_SETTINGS_KEY)
  const v = raw[ANON_TRANSLATION_SETTINGS_KEY]
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as AnonTranslationStored
  }
  return {}
}

async function writeAnonTranslationStored(partial: AnonTranslationStored): Promise<void> {
  const prev = await readAnonTranslationStored()
  await chrome.storage.local.set({
    [ANON_TRANSLATION_SETTINGS_KEY]: { ...prev, ...partial },
  })
}

async function getAnonymousTranslationSettings(): Promise<TranslationSettings> {
  const stored = await readAnonTranslationStored()
  const useFromFlag = await readUseMyMemoryFromLocalStorage()
  const now = new Date().toISOString()
  const learning =
    stored.learning_languages && stored.learning_languages.length > 0
      ? [...stored.learning_languages]
      : [...DEFAULT_SETTINGS.learning_languages]
  const useMem = stored.use_mymemory !== undefined ? stored.use_mymemory : useFromFlag
  return {
    user_id: '',
    native_language: stored.native_language ?? DEFAULT_SETTINGS.native_language,
    learning_languages: learning,
    default_provider: DEFAULT_SETTINGS.default_provider,
    auto_detect: DEFAULT_SETTINGS.auto_detect,
    auto_save: DEFAULT_SETTINGS.auto_save,
    domain_overrides: DEFAULT_SETTINGS.domain_overrides,
    use_mymemory: useMem,
    created_at: now,
    updated_at: now,
  }
}

/** Sync use_mymemory preference sang chrome.storage.local để accessible ở mọi context */
async function syncUseMyMemoryToLocal(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [USE_MYMEMORY_KEY]: value })
}

export const translationSettingsService = {
  async getOrCreate(): Promise<TranslationSettings> {
    const userId = await getSessionUserId()
    if (!userId) {
      return getAnonymousTranslationSettings()
    }

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
    const userId = await getSessionUserId()
    if (!userId) {
      const current = await getAnonymousTranslationSettings()
      const merged: TranslationSettings = {
        ...current,
        ...updates,
        learning_languages: updates.learning_languages
          ? [...updates.learning_languages]
          : current.learning_languages,
        user_id: '',
        updated_at: new Date().toISOString(),
      }
      await writeAnonTranslationStored({
        native_language: merged.native_language,
        learning_languages: merged.learning_languages,
        use_mymemory: merged.use_mymemory,
      })
      if ('use_mymemory' in updates) {
        await syncUseMyMemoryToLocal(merged.use_mymemory ?? true)
      }
      return merged
    }

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
