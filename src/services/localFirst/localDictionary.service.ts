import { localStore } from './localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type { LocalDictionaryEntry } from '@/types/localFirst'
import type { DictionaryEntry, LangCode } from '@/types/dictionary'
import { normalizeDictionarySourceKey } from '@/services/dictionary/sourceKey'

const KEY = LOCAL_STORAGE_KEYS.dictionary

export const localDictionaryService = {
  async getAll(): Promise<LocalDictionaryEntry[]> {
    const arr = await localStore.getArray<LocalDictionaryEntry>(KEY)
    return [...arr].sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async create(
    input: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<LocalDictionaryEntry> {
    const now = new Date().toISOString()
    const source_text = normalizeDictionarySourceKey(
      input.source_text,
      input.source_lang,
      input.entry_type,
    )

    // Kiểm tra duplicate (same source_text + langs)
    const existing = await this.findExisting(source_text, input.source_lang, input.target_lang)
    if (existing) {
      return this.update(existing.id, {
        translated_text: input.translated_text,
        enrichment: input.enrichment,
      })
    }

    const entry: LocalDictionaryEntry = {
      ...input,
      source_text,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
      __synced: false,
    }

    await localStore.pushItem(KEY, entry)
    return entry
  },

  async upsert(
    input: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<LocalDictionaryEntry> {
    return this.create(input)
  },

  async update(
    id: string,
    updates: Partial<Omit<LocalDictionaryEntry, 'id' | 'created_at'>>,
  ): Promise<LocalDictionaryEntry> {
    const arr = await localStore.getArray<LocalDictionaryEntry>(KEY)
    const idx = arr.findIndex((e) => e.id === id)
    if (idx < 0) throw new Error('Entry not found in local store')

    const updated: LocalDictionaryEntry = {
      ...arr[idx],
      ...updates,
      updated_at: new Date().toISOString(),
      __synced: false,
    }
    arr[idx] = updated
    await localStore.setArray(KEY, arr)
    return updated
  },

  async delete(id: string): Promise<void> {
    const arr = await localStore.getArray<LocalDictionaryEntry>(KEY)
    await localStore.setArray(
      KEY,
      arr.filter((e) => e.id !== id),
    )
  },

  async findExisting(
    source_text: string,
    source_lang: LangCode,
    target_lang: LangCode,
  ): Promise<LocalDictionaryEntry | null> {
    const arr = await this.getAll()
    return (
      arr.find(
        (e) =>
          e.source_text === source_text &&
          e.source_lang === source_lang &&
          e.target_lang === target_lang,
      ) ?? null
    )
  },

  async exists(
    source_text: string,
    source_lang: LangCode,
    target_lang: LangCode,
  ): Promise<{ exists: boolean; entryId?: string }> {
    const found = await this.findExisting(source_text, source_lang, target_lang)
    return found ? { exists: true, entryId: found.id } : { exists: false }
  },

  /** Đếm số entry chưa đồng bộ lên cloud (dùng cho badge) */
  async pendingSyncCount(): Promise<number> {
    const arr = await this.getAll()
    return arr.filter((e) => !e.__synced).length
  },
}
