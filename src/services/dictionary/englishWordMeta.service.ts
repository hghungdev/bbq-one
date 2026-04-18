import type { TranslationEnrichment, TranslationResult } from '@/types/dictionary'
import { isKeywordEntry } from '@/services/dictionary/segmenter'

const DICT_API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en'

interface DictMeaning {
  partOfSpeech: string
  definitions: Array<{ definition: string; synonyms?: string[] }>
}

interface DictEntry {
  word: string
  phonetics?: Array<{ text?: string; audio?: string }>
  meanings: DictMeaning[]
}

function isDictEntry(x: unknown): x is DictEntry {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return Array.isArray(o.meanings) && o.meanings.length > 0
}

function collectSynonyms(meanings: DictMeaning[], max: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of meanings) {
    for (const d of m.definitions) {
      for (const s of d.synonyms ?? []) {
        const k = s.toLowerCase()
        if (!seen.has(k)) {
          seen.add(k)
          out.push(s)
          if (out.length >= max) return out
        }
      }
    }
  }
  return out
}

/**
 * Tra cứu từ đơn tiếng Anh (Free Dictionary API) — từ loại + đồng nghĩa (EN).
 * Không thay thế Google Translate; chỉ bổ sung khi nguồn là EN và một từ.
 */
export async function fetchEnglishDictionaryEnrichment(
  word: string,
): Promise<TranslationEnrichment | null> {
  const w = word.trim().toLowerCase()
  if (!w || /\s/.test(w)) return null

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`${DICT_API_BASE}/${encodeURIComponent(w)}`, {
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    if (!Array.isArray(data) || !data[0]) return null
    const first = data[0]
    if (!isDictEntry(first)) return null
    const entry = first
    const meanings = entry.meanings
    const posList = [...new Set(meanings.map((m) => m.partOfSpeech))]
    const partOfSpeech = posList.join(', ')
    const synonyms = collectSynonyms(meanings, 14)
    const phonetic = entry.phonetics?.find((p) => p.text?.trim())?.text?.trim()

    const out: TranslationEnrichment = { partOfSpeech }
    if (synonyms.length) out.synonyms = synonyms
    if (phonetic) out.phonetic = phonetic
    return out
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/** Gắn từ loại / đồng nghĩa khi dịch một từ tiếng Anh (Chrome Translator không cung cấp). */
export async function enrichTranslationWithEnglishDictionary(
  r: TranslationResult,
): Promise<TranslationResult> {
  if (!isKeywordEntry(r.sourceText) || r.sourceLang !== 'en') return r
  const extra = await fetchEnglishDictionaryEnrichment(r.sourceText)
  if (!extra) return r
  return {
    ...r,
    enrichment: { ...r.enrichment, ...extra },
  }
}
