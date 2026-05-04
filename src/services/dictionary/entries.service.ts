import { supabase } from '@/services/supabase'
import type { DictionaryEntry, LangCode } from '@/types/dictionary'
import {
  isEnglishKeywordForCaseFold,
  normalizeDictionarySourceKey,
  normalizeDictionarySourceKeyFromHeuristic,
} from '@/services/dictionary/sourceKey'
import { isAuthenticated, getCurrentUserId } from '@/services/localFirst/authMode'
import { localDictionaryService } from '@/services/localFirst/localDictionary.service'

export const dictionaryEntriesService = {
  async getAll(): Promise<DictionaryEntry[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('user_dictionary_entries')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    }

    // Local mode: cast user_id = '' vì UI không dùng user_id để hiển thị
    const localEntries = await localDictionaryService.getAll()
    return localEntries.map((e) => ({ ...e, user_id: '' }) as DictionaryEntry)
  },

  async create(
    input: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<DictionaryEntry> {
    if (await isAuthenticated()) {
      const userId = await getCurrentUserId()
      const source_text = normalizeDictionarySourceKey(
        input.source_text,
        input.source_lang,
        input.entry_type,
      )
      const { data, error } = await supabase
        .from('user_dictionary_entries')
        .insert({ ...input, user_id: userId, source_text })
        .select()
        .single()
      if (error) throw error
      return data
    }

    // Local mode
    const local = await localDictionaryService.create(input)
    return { ...local, user_id: '' } as DictionaryEntry
  },

  async upsert(
    input: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<DictionaryEntry> {
    if (await isAuthenticated()) {
      const userId = await getCurrentUserId()
      const source_text = normalizeDictionarySourceKey(
        input.source_text,
        input.source_lang,
        input.entry_type,
      )
      const { data, error } = await supabase
        .from('user_dictionary_entries')
        .upsert(
          { ...input, user_id: userId, source_text },
          { onConflict: 'user_id,source_text,source_lang,target_lang' },
        )
        .select()
        .single()
      if (error) throw error
      return data
    }

    // Local mode
    const local = await localDictionaryService.upsert(input)
    return { ...local, user_id: '' } as DictionaryEntry
  },

  async delete(id: string): Promise<void> {
    if (await isAuthenticated()) {
      const { error } = await supabase
        .from('user_dictionary_entries')
        .delete()
        .eq('id', id)
      if (error) throw error
      return
    }
    await localDictionaryService.delete(id)
  },

  async exists(
    source_text: string,
    source_lang: LangCode,
    target_lang: LangCode,
  ): Promise<{ exists: boolean; entryId?: string }> {
    if (await isAuthenticated()) {
      const key = normalizeDictionarySourceKeyFromHeuristic(source_text, source_lang)
      const foldEn = isEnglishKeywordForCaseFold(source_text, source_lang)

      let q = supabase
        .from('user_dictionary_entries')
        .select('id')
        .eq('source_lang', source_lang)
        .eq('target_lang', target_lang)

      if (foldEn) {
        q = q.ilike('source_text', key)
      } else {
        q = q.eq('source_text', source_text.trim())
      }

      const { data, error } = await q.limit(1)
      if (error) throw error
      const row = data?.[0]
      return row ? { exists: true, entryId: row.id } : { exists: false }
    }

    return localDictionaryService.exists(source_text, source_lang, target_lang)
  },

  async searchFullText(query: string): Promise<DictionaryEntry[]> {
    if (await isAuthenticated()) {
      const q = query.trim()
      if (!q) return dictionaryEntriesService.getAll()

      const { data, error } = await supabase
        .from('user_dictionary_entries')
        .select('*')
        .textSearch('fts', q, { type: 'plain', config: 'simple' })
        .order('created_at', { ascending: false })

      if (error) {
        const all = await dictionaryEntriesService.getAll()
        return filterEntriesBySubstring(all, q)
      }
      if (!data?.length) {
        const all = await dictionaryEntriesService.getAll()
        return filterEntriesBySubstring(all, q)
      }
      return data
    }

    // Local mode: substring search
    const all = await localDictionaryService.getAll()
    const q = query.trim().toLowerCase()
    if (!q) return all.map((e) => ({ ...e, user_id: '' }) as DictionaryEntry)
    return all
      .filter(
        (e) =>
          e.source_text.toLowerCase().includes(q) ||
          e.translated_text.toLowerCase().includes(q) ||
          e.custom_note.toLowerCase().includes(q),
      )
      .map((e) => ({ ...e, user_id: '' }) as DictionaryEntry)
  },
}

export function filterEntriesBySubstring(
  entries: DictionaryEntry[],
  query: string,
): DictionaryEntry[] {
  const lower = query.trim().toLowerCase()
  if (!lower) return []
  return entries.filter(
    (e) =>
      e.source_text.toLowerCase().includes(lower) ||
      e.translated_text.toLowerCase().includes(lower) ||
      e.custom_note.toLowerCase().includes(lower),
  )
}
