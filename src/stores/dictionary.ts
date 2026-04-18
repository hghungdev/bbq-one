import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DICTIONARY_CACHE_KEY } from '@/constants/storage'
import { dictionaryEntriesService } from '@/services/dictionary/entries.service'
import type { DictionaryEntry } from '@/types/dictionary'

export const useDictionaryStore = defineStore('dictionary', () => {
  const entries = ref<DictionaryEntry[]>([])
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const searchQuery = ref('')

  const filteredEntries = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return entries.value
    return entries.value.filter((e) =>
      e.source_text.toLowerCase().includes(q) ||
      e.translated_text.toLowerCase().includes(q) ||
      e.custom_note.toLowerCase().includes(q),
    )
  })

  const totalCount = computed(() => entries.value.length)

  async function loadAll(): Promise<void> {
    loading.value = true
    loadError.value = null
    try {
      const rows = await dictionaryEntriesService.getAll()
      entries.value = rows
      await saveCache(rows)
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e)
      // Fallback cache
      const cached = await readCache()
      if (cached.length) entries.value = cached
    } finally {
      loading.value = false
    }
  }

  async function runSearch(q: string): Promise<void> {
    searchQuery.value = q.trim()
    // Phase 1: local filter đủ dùng cho < 5k entries
    // Phase 2: switch sang FTS server-side nếu local filter chậm
  }

  async function addLocalEntry(entry: DictionaryEntry): Promise<void> {
    const exists = entries.value.findIndex((e) => e.id === entry.id)
    if (exists >= 0) entries.value.splice(exists, 1, entry)
    else entries.value.unshift(entry)
    await saveCache(entries.value)
  }

  async function removeEntry(id: string): Promise<void> {
    await dictionaryEntriesService.delete(id)
    entries.value = entries.value.filter((e) => e.id !== id)
    await saveCache(entries.value)
  }

  async function saveCache(rows: DictionaryEntry[]): Promise<void> {
    await chrome.storage.local.set({ [DICTIONARY_CACHE_KEY]: rows })
  }

  async function readCache(): Promise<DictionaryEntry[]> {
    const result = await chrome.storage.local.get(DICTIONARY_CACHE_KEY)
    const v = result[DICTIONARY_CACHE_KEY]
    return Array.isArray(v) ? (v as DictionaryEntry[]) : []
  }

  return {
    entries,
    loading,
    loadError,
    searchQuery,
    filteredEntries,
    totalCount,
    loadAll,
    runSearch,
    addLocalEntry,
    removeEntry,
  }
})
