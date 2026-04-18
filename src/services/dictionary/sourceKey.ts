import type { EntryType, LangCode } from '@/types/dictionary'
import { isKeywordEntry } from '@/services/dictionary/segmenter'

/**
 * Khóa lưu từ điển: từ đơn tiếng Anh không phân biệt hoa/thường (lead = Lead)
 * để popup quét + QuickTranslate không tạo hai dòng.
 */
export function normalizeDictionarySourceKey(
  sourceText: string,
  sourceLang: LangCode,
  entryType: EntryType,
): string {
  const t = sourceText.trim()
  if (entryType !== 'word') return t
  if (sourceLang === 'en') return t.toLowerCase()
  return t
}

/** Khi chỉ có text từ translator (chưa có entry_type): áp dụng cùng quy tắc từ đơn EN. */
export function normalizeDictionarySourceKeyFromHeuristic(
  sourceText: string,
  sourceLang: LangCode,
): string {
  const t = sourceText.trim()
  if (sourceLang === 'en' && isKeywordEntry(sourceText)) {
    return t.toLowerCase()
  }
  return t
}

export function isEnglishKeywordForCaseFold(sourceText: string, sourceLang: LangCode): boolean {
  return sourceLang === 'en' && isKeywordEntry(sourceText)
}
