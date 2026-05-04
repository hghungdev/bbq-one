import { supabase } from '@/services/supabase'
import { localStore } from './localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type { LocalDictionaryEntry, LocalNote, LocalBookmark } from '@/types/localFirst'

export interface ConflictItem {
  entity: 'dictionary' | 'note' | 'bookmark'
  identifier: string // human-readable, e.g. "environment (en→vi)"
  localValue: string // preview of local data
  cloudValue: string // preview of cloud data
  localUpdatedAt: string
  cloudUpdatedAt: string
}

export interface ConflictReport {
  totalLocal: number
  totalConflicts: number
  conflicts: ConflictItem[] // limited to first 20 for UI
  hasMore: boolean
}

const CONFLICT_PREVIEW_LIMIT = 20

/**
 * Detect overlaps giữa local data và cloud data TRƯỚC khi sync.
 * Returns report để UI có thể show dialog.
 *
 * Phase 1: chỉ check dictionary (có unique key rõ ràng).
 * Notes/bookmarks dùng random UUID → không overlap, chỉ đếm.
 */
export async function detectSyncConflicts(): Promise<ConflictReport> {
  const conflicts: ConflictItem[] = []
  let totalLocal = 0

  // 1. Dictionary — kiểm tra conflict dựa trên (source_text + source_lang + target_lang)
  const localEntries = await localStore.getArray<LocalDictionaryEntry>(
    LOCAL_STORAGE_KEYS.dictionary,
  )
  totalLocal += localEntries.length

  if (localEntries.length > 0) {
    // Fetch toàn bộ cloud entries của user để so sánh client-side
    // Đơn giản hơn batch OR query và tránh vấn đề escape special chars
    const { data: cloudEntries, error } = await supabase
      .from('user_dictionary_entries')
      .select('source_text, source_lang, target_lang, translated_text, updated_at')

    if (!error && cloudEntries) {
      for (const local of localEntries) {
        const cloudMatch = cloudEntries.find(
          (c) =>
            c.source_text === local.source_text &&
            c.source_lang === local.source_lang &&
            c.target_lang === local.target_lang,
        )

        if (cloudMatch && cloudMatch.translated_text !== local.translated_text) {
          if (conflicts.length < CONFLICT_PREVIEW_LIMIT) {
            conflicts.push({
              entity: 'dictionary',
              identifier: `${local.source_text} (${local.source_lang}→${local.target_lang})`,
              localValue: local.translated_text,
              cloudValue: cloudMatch.translated_text,
              localUpdatedAt: local.updated_at,
              cloudUpdatedAt: cloudMatch.updated_at,
            })
          }
        }
      }
    } else if (error) {
      console.warn('[ConflictDetector] Cloud query failed:', error)
    }
  }

  // 2. Notes + bookmarks — chỉ đếm (informational, no overlap detection in Phase 1)
  const localNotes = await localStore.getArray<LocalNote>(LOCAL_STORAGE_KEYS.notes)
  const localBookmarks = await localStore.getArray<LocalBookmark>(LOCAL_STORAGE_KEYS.bookmarks)
  totalLocal += localNotes.length + localBookmarks.length

  const totalConflicts = conflicts.length

  return {
    totalLocal,
    totalConflicts,
    conflicts,
    hasMore: totalConflicts >= CONFLICT_PREVIEW_LIMIT,
  }
}
