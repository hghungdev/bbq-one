import type { LangCode } from '@/types/dictionary'
import { isKeywordEntry } from '@/services/dictionary/segmenter'
import { hasVietnameseMark, type MixedRun } from '@/services/translator/mixedViEnSegments'

const APP_LANG_CODES: ReadonlySet<string> = new Set([
  'vi',
  'en',
  'ja',
  'zh',
  'th',
  'ko',
  'fr',
  'de',
  'es',
])

/** nl/af: detector Chrome hay gán cho từ tiếng Anh cùng chữ viết (vd. "burden" → nl). */
const STRONG_LATIN_FALSE_POSITIVE_EN = new Set(['nl', 'af'])

/**
 * Câu lẫn VI+EN: thêm các mã Germanic khác hay trùng chữ với tiếng Anh trong ngữ cảnh đó.
 */
const MIXED_SENTENCE_LATIN_CONFUSABLE = new Set([
  'nl',
  'af',
  'da',
  'fy',
  'lb',
  'sv',
  'no',
  'is',
])

/** Từ đơn ASCII coi là ứng viên tiếng Anh khi detector trả về nl/af. */
const ASCII_ENGLISHY_WORD = /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/

function baseTag(code: string): string {
  return code.trim().toLowerCase().split('-')[0] ?? ''
}

/**
 * Chuẩn hóa sourceLang hiển thị / lưu dictionary sau khi dịch (đặc biệt đích tiếng Việt).
 */
export function resolveSourceLangForResult(
  text: string,
  targetLang: LangCode,
  detectedRaw: string,
  runs: MixedRun[] | null,
): LangCode {
  const b = baseTag(detectedRaw)

  if (targetLang === 'vi' && runs && runs.length > 0) {
    const hasViKeep = runs.some((r) => r.action === 'keep' && hasVietnameseMark(r.text))
    const hasEnTranslate = runs.some((r) => r.action === 'translate' && r.sourceLang === 'en')
    if (hasEnTranslate && !hasViKeep) return 'en'
    if (hasEnTranslate && hasViKeep && MIXED_SENTENCE_LATIN_CONFUSABLE.has(b)) return 'en'
  }

  if (
    targetLang === 'vi' &&
    isKeywordEntry(text) &&
    !hasVietnameseMark(text) &&
    ASCII_ENGLISHY_WORD.test(text.trim()) &&
    STRONG_LATIN_FALSE_POSITIVE_EN.has(b)
  ) {
    return 'en'
  }

  if (APP_LANG_CODES.has(b)) return b as LangCode

  if (targetLang === 'vi' && STRONG_LATIN_FALSE_POSITIVE_EN.has(b) && !hasVietnameseMark(text)) {
    return 'en'
  }

  if (hasVietnameseMark(text)) return 'vi'

  return 'en'
}
