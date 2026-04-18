import { defineStore } from 'pinia'
import { ref } from 'vue'
import { translationSettingsService } from '@/services/dictionary/settings.service'
import type { LangCode, TranslationSettings } from '@/types/dictionary'

export const useTranslationSettingsStore = defineStore('translationSettings', () => {
  const settings = ref<TranslationSettings | null>(null)
  const loading = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      settings.value = await translationSettingsService.getOrCreate()
    } finally {
      loading.value = false
    }
  }

  async function updateNativeLanguage(lang: LangCode): Promise<void> {
    settings.value = await translationSettingsService.update({ native_language: lang })
  }

  async function updateLearningLanguages(langs: LangCode[]): Promise<void> {
    settings.value = await translationSettingsService.update({ learning_languages: langs })
  }

  /**
   * Decide target language based on native + learning settings.
   * - Detected lang ∈ learning_languages → target = native
   * - Detected lang = native → target = first learning_language
   * - Otherwise → target = native
   */
  function decideTargetLang(detectedLang: LangCode): LangCode {
    const s = settings.value
    if (!s) return 'vi'
    if (s.learning_languages.includes(detectedLang)) return s.native_language
    if (detectedLang === s.native_language) return s.learning_languages[0] ?? 'en'
    return s.native_language
  }

  return { settings, loading, load, updateNativeLanguage, updateLearningLanguages, decideTargetLang }
})
