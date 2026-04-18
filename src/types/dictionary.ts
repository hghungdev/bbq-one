/** Supported ISO 639-1 language codes Phase 1 */
export type LangCode = 'vi' | 'en' | 'ja' | 'zh' | 'th' | 'ko' | 'fr' | 'de' | 'es'
export type LangCodeOrAuto = LangCode | 'auto'

export type EntryType = 'word' | 'phrase' | 'sentence'

/** Translation request shape — shared giữa providers */
export interface TranslationRequest {
  text: string
  sourceLang: LangCodeOrAuto
  targetLang: LangCode
  mode: 'quick' | 'deep'     // Phase 1: quick only. Phase 2: deep.
}

/** Translation result — shared */
export interface TranslationResult {
  sourceText: string
  sourceLang: LangCode          // detected if was 'auto'
  targetLang: LangCode
  translatedText: string
  provider: string              // 'chrome-local' | 'gemini' | ...
  confidence?: number           // 0..1, từ language detector
  /** Phase 2 enrichment — Phase 1 để undefined */
  enrichment?: TranslationEnrichment
}

export interface TranslationEnrichment {
  phonetic?: string
  synonyms?: string[]
  examples?: string[]
  grammar?: string
  /** Từ loại (tiếng Anh) từ Free Dictionary API — ví dụ adverb, verb, adjective */
  partOfSpeech?: string
}

/** Provider interface — Strategy Pattern */
export interface ITranslationProvider {
  readonly name: string
  readonly supportsMode: ReadonlyArray<'quick' | 'deep'>
  isAvailable(req?: Pick<TranslationRequest, 'sourceLang' | 'targetLang'>): Promise<boolean>
  translate(req: TranslationRequest): Promise<TranslationResult>
}

/** Dictionary entry — row của user_dictionary_entries */
export interface DictionaryEntry {
  id: string
  user_id: string
  source_text: string
  source_lang: LangCode
  target_lang: LangCode
  translated_text: string
  entry_type: EntryType
  provider: string
  custom_note: string
  enrichment: TranslationEnrichment | null
  starred: boolean
  tags: string[]
  mastery_level: number
  review_count: number
  last_reviewed_at: string | null
  created_at: string
  updated_at: string
}

/** User translation settings */
export interface TranslationSettings {
  user_id: string
  native_language: LangCode
  learning_languages: LangCode[]
  default_provider: string
  auto_detect: boolean
  auto_save: boolean
  domain_overrides: Record<string, { target?: LangCode }>  // Phase 2
  created_at: string
  updated_at: string
}

/** Message types giữa content script ↔ background ↔ popup */
export type DictMessage =
  | { type: 'translate'; payload: TranslationRequest }
  | { type: 'save-entry'; payload: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'> }
  | { type: 'get-settings' }
  | { type: 'entry-exists'; payload: { source_text: string; source_lang: LangCode; target_lang: LangCode } }

export type DictMessageResponse<M extends DictMessage> =
  M extends { type: 'translate' } ? TranslationResult :
  M extends { type: 'save-entry' } ? { ok: true; entry: DictionaryEntry } | { ok: false; error: string } :
  M extends { type: 'get-settings' } ? TranslationSettings :
  M extends { type: 'entry-exists' } ? { exists: boolean; entryId?: string } :
  never
