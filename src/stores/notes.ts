import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { NOTES_CACHE_KEY } from '@/constants/storage'
import { filterNotesBySubstring, notesService } from '@/services/notes.service'
import { useFoldersStore } from '@/stores/folders'
import { useSecureFolderStore } from '@/stores/secureFolder'
import type { Note } from '@/types'
import { decryptField, encryptField } from '@/utils/secureCrypto'

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
      const folderStore = useFoldersStore()
      const fromApi = await notesService.searchFullText(q)
      const fromStore = filterNotesBySubstring(notes.value, q)
      const byId = new Map<string, Note>()
      for (const n of fromApi) byId.set(n.id, n)
      for (const n of fromStore) byId.set(n.id, n)
      /* Search global chỉ gồm note folder thường — bỏ toàn bộ folder secure. */
      searchResults.value = [...byId.values()]
        .filter((n) => !folderStore.isSecureFolder(n.folder_id))
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
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
      await useSecureFolderStore().refreshDecryptedNotesAfterLoad()
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
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null
    const key =
      folderId && folder?.is_secure ? secure.getKey(folderId) : null
    if (folder?.is_secure && !key) {
      throw new Error('Folder locked')
    }
    let title = ''
    let content = ''
    if (folder?.is_secure && key) {
      title = await encryptField('', key)
      content = await encryptField('', key)
    }
    const note = await notesService.create({
      title,
      content,
      folder_id: folderId,
      tags: [],
    })
    let stored = note
    if (folder?.is_secure && key) {
      stored = {
        ...note,
        title: await decryptField(note.title, key),
        content: await decryptField(note.content, key),
      }
    }
    notes.value = [stored, ...notes.value]
    activeNoteId.value = stored.id
    isDirty.value = false
    await persistCache()
    return stored
  }

  async function updateNote(
    id: string,
    updates: Partial<Pick<Note, 'title' | 'content' | 'folder_id' | 'tags'>>,
  ): Promise<void> {
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const idx = notes.value.findIndex((n) => n.id === id)
    const prev = idx === -1 ? null : notes.value[idx]
    if (!prev) return

    const folderId =
      updates.folder_id !== undefined ? updates.folder_id : prev.folder_id
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null

    let payload: Partial<
      Pick<Note, 'title' | 'content' | 'folder_id' | 'tags'>
    > = { ...updates }

    if (folder?.is_secure) {
      const key = secure.getKey(folderId!)
      if (!key) throw new Error('Folder locked')
      if (payload.title !== undefined) {
        payload.title = await encryptField(payload.title, key)
      }
      if (payload.content !== undefined) {
        payload.content = await encryptField(payload.content, key)
      }
    }

    const data = await notesService.update(id, payload)
    const merged: Note = { ...prev, ...data }

    if (folder?.is_secure) {
      const key = secure.getKey(folderId!)
      if (key) {
        notes.value[idx] = {
          ...merged,
          title: await decryptField(data.title, key),
          content: await decryptField(data.content, key),
        }
      } else {
        notes.value[idx] = merged
      }
    } else {
      notes.value[idx] = merged
    }
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
    /* Đang search: chọn note → tắt search để mở editor (tránh body ẩn mãi). */
    if (id && searchQuery.value.trim()) clearSearch()
    activeNoteId.value = id
    if (!id) return
    const n = notes.value.find((x) => x.id === id)
    if (n?.folder_id) {
      useFoldersStore().alignActiveFolderToNoteFolder(n.folder_id)
    }
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
