import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { NOTES_CACHE_KEY } from '@/constants/storage'
import { notesService } from '@/services/notes.service'
import type { Note } from '@/types'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const activeNoteId = ref<string | null>(null)
  const isDirty = ref(false)
  const loadError = ref<string | null>(null)
  const filterTag = ref<string | null>(null)
  const searchQuery = ref('')
  const searchResults = ref<Note[]>([])
  const searchLoading = ref(false)

  const activeNote = computed(
    () => notes.value.find((n) => n.id === activeNoteId.value) ?? null,
  )

  function notesForFolder(folderId: string | null): Note[] {
    return notes.value
      .filter((n) => n.folder_id === folderId)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
  }

  async function runSearch(query: string): Promise<void> {
    const q = query.trim()
    searchQuery.value = q
    if (!q) {
      searchResults.value = []
      return
    }
    searchLoading.value = true
    try {
      searchResults.value = await notesService.searchFullText(q)
    } finally {
      searchLoading.value = false
    }
  }

  function clearSearch(): void {
    searchQuery.value = ''
    searchResults.value = []
  }

  function setFilterTag(tag: string | null): void {
    if (tag && filterTag.value === tag) {
      filterTag.value = null
      return
    }
    filterTag.value = tag
  }

  async function persistCache(): Promise<void> {
    await chrome.storage.local.set({ [NOTES_CACHE_KEY]: notes.value })
  }

  async function loadAll(): Promise<void> {
    loadError.value = null
    try {
      const cached = await chrome.storage.local.get(NOTES_CACHE_KEY)
      const raw = cached[NOTES_CACHE_KEY] as Note[] | undefined
      if (Array.isArray(raw) && raw.length > 0) {
        notes.value = raw
      }
      const fresh = await notesService.getAll()
      notes.value = fresh
      await persistCache()
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : 'Load notes failed'
      const cached = await chrome.storage.local.get(NOTES_CACHE_KEY)
      const raw = cached[NOTES_CACHE_KEY] as Note[] | undefined
      if (Array.isArray(raw) && raw.length > 0) {
        notes.value = raw
      }
    }
  }

  async function createNote(folderId: string | null): Promise<Note> {
    const note = await notesService.create({
      title: '',
      content: '',
      folder_id: folderId,
      tags: [],
    })
    notes.value = [note, ...notes.value]
    activeNoteId.value = note.id
    isDirty.value = false
    await persistCache()
    return note
  }

  async function updateNote(
    id: string,
    updates: Partial<Pick<Note, 'title' | 'content' | 'folder_id' | 'tags'>>,
  ): Promise<void> {
    const data = await notesService.update(id, updates)
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx !== -1) notes.value[idx] = { ...notes.value[idx], ...data }
    isDirty.value = false
    await persistCache()
  }

  async function deleteNote(id: string): Promise<void> {
    await notesService.delete(id)
    notes.value = notes.value.filter((n) => n.id !== id)
    if (activeNoteId.value === id) activeNoteId.value = null
    await persistCache()
  }

  function selectNote(id: string | null): void {
    activeNoteId.value = id
  }

  function setDirty(value: boolean): void {
    isDirty.value = value
  }

  return {
    notes,
    activeNoteId,
    activeNote,
    isDirty,
    loadError,
    filterTag,
    searchQuery,
    searchResults,
    searchLoading,
    notesForFolder,
    runSearch,
    clearSearch,
    setFilterTag,
    loadAll,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
    setDirty,
    persistCache,
  }
})
