import type { LangCode } from '@/types/dictionary'

/** Map ISO 639-1 → human-readable display name */
export const LANG_NAMES: Record<LangCode, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  ja: '日本語',
  zh: '中文',
  th: 'ไทย',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
}

export function getLangName(code: LangCode | string): string {
  return LANG_NAMES[code as LangCode] ?? code.toUpperCase()
}
