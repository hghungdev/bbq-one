/** Split text thành câu dùng Intl.Segmenter (Chrome built-in). Fallback regex. */
export function segmentSentences(text: string, locale: string = 'en'): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // Intl.Segmenter is available in Chrome 87+ (ES2022 spec), cast to avoid lib target mismatch
  const IntlAny = Intl as Record<string, unknown>
  if (typeof IntlAny['Segmenter'] === 'function') {
    try {
      const SegmenterCtor = IntlAny['Segmenter'] as new (
        locale: string,
        opts: { granularity: 'sentence' },
      ) => { segment(text: string): Iterable<{ segment: string }> }
      const segmenter = new SegmenterCtor(locale, { granularity: 'sentence' })
      return [...segmenter.segment(trimmed)]
        .map((s) => s.segment.trim())
        .filter(Boolean)
    } catch {
      // fallthrough to regex fallback
    }
  }
  // Fallback
  return trimmed.split(/(?<=[.!?。！？])\s+/).map((s) => s.trim()).filter(Boolean)
}

/** Quyết định entry_type dựa trên length */
export function classifyEntryType(text: string): 'word' | 'phrase' | 'sentence' {
  const trimmed = text.trim()
  const words = trimmed.split(/\s+/).length
  // CJK không có space → dùng char count
  const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(trimmed)

  if (isCJK) {
    if (trimmed.length <= 3) return 'word'
    if (trimmed.length <= 15) return 'phrase'
    return 'sentence'
  }

  if (words <= 1) return 'word'
  if (words <= 4) return 'phrase'
  return 'sentence'
}

/** Chỉ từ đơn (keyword) mới được lưu vào dictionary từ popup. */
export function isKeywordEntry(text: string): boolean {
  return classifyEntryType(text) === 'word'
}
