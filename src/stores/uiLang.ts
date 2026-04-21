import { defineStore } from 'pinia'
import { ref } from 'vue'
import { en } from '@/i18n/en'
import { vi } from '@/i18n/vi'
import type { I18nKey } from '@/i18n/en'
import { UI_LANG_KEY } from '@/constants/storage'

export type LangCode = 'en' | 'vi'

const LOCALES: Record<LangCode, Record<string, string>> = {
  en: en as Record<string, string>,
  vi: vi as Record<string, string>,
}

export const useLangStore = defineStore('uiLang', () => {
  const lang = ref<LangCode>('en')

  async function loadLang(): Promise<void> {
    try {
      const r = await chrome.storage.local.get(UI_LANG_KEY)
      const v = r[UI_LANG_KEY]
      if (v === 'vi' || v === 'en') lang.value = v
    } catch {
      // Fallback to default if chrome.storage unavailable (e.g. unit tests)
    }
  }

  async function setLang(l: LangCode): Promise<void> {
    lang.value = l
    try {
      await chrome.storage.local.set({ [UI_LANG_KEY]: l })
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Translate a key, with optional {param} interpolation.
   * Reads lang.value reactively — any template calling t() will re-render on lang change.
   */
  function t(key: I18nKey, params?: Record<string, string | number>): string {
    const locale = LOCALES[lang.value]
    let str = locale[key] ?? (en as Record<string, string>)[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, String(v))
      }
    }
    return str
  }

  return { lang, loadLang, setLang, t }
})
