import { supabase } from '@/services/supabase'
import type { DictionaryEntry, LangCode } from '@/types/dictionary'
import {
  isEnglishKeywordForCaseFold,
  normalizeDictionarySourceKey,
  normalizeDictionarySourceKeyFromHeuristic,
} from '@/services/dictionary/sourceKey'

async function requireUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export const dictionaryEntriesService = {
  async getAll(): Promise<DictionaryEntry[]> {
    const { data, error } = await supabase
      .from('user_dictionary_entries')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async create(
    input: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<DictionaryEntry> {
    const userId = await requireUserId()
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
  },

  async upsert(
    input: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<DictionaryEntry> {
    // Nếu đã tồn tại (user_id + source_text + source_lang + target_lang) → update translated_text
    const userId = await requireUserId()
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
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('user_dictionary_entries').delete().eq('id', id)
    if (error) throw error
  },

  async exists(
    source_text: string,
    source_lang: LangCode,
    target_lang: LangCode,
  ): Promise<{ exists: boolean; entryId?: string }> {
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
  },

  async searchFullText(query: string): Promise<DictionaryEntry[]> {
    const q = query.trim()
    if (!q) return dictionaryEntriesService.getAll()

    const { data, error } = await supabase
      .from('user_dictionary_entries')
      .select('*')
      .textSearch('fts', q, { type: 'plain', config: 'simple' })
      .order('created_at', { ascending: false })

    if (error) {
      // Fallback substring
      const all = await dictionaryEntriesService.getAll()
      return filterEntriesBySubstring(all, q)
    }
    if (!data?.length) {
      const all = await dictionaryEntriesService.getAll()
      return filterEntriesBySubstring(all, q)
    }
    return data
  },
}

export function filterEntriesBySubstring(
  entries: DictionaryEntry[],
  query: string,
): DictionaryEntry[] {
  const lower = query.trim().toLowerCase()
  if (!lower) return []
  return entries.filter((e) =>
    e.source_text.toLowerCase().includes(lower) ||
    e.translated_text.toLowerCase().includes(lower) ||
    e.custom_note.toLowerCase().includes(lower),
  )
}
