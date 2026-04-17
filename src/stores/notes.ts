import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { NOTE_BODIES_CACHE_KEY, NOTES_CACHE_KEY } from '@/constants/storage'
import { noteBodiesService } from '@/services/noteBodies.service'
import { filterNotesBySubstring, notesService } from '@/services/notes.service'
import { useFoldersStore } from '@/stores/folders'
import { useSecureFolderStore } from '@/stores/secureFolder'
import type { Note, NoteBody } from '@/types'
import { decryptField, encryptField } from '@/utils/secureCrypto'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const bodies = ref<NoteBody[]>([])
  const activeNoteId = ref<string | null>(null)
  /** Body đang mở trong editor (phải thuộc activeNoteId). */
  const activeBodyId = ref<string | null>(null)
  const isDirty = ref(false)
  const loadError = ref<string | null>(null)
  const filterTag = ref<string | null>(null)
  const searchQuery = ref('')
  const searchResults = ref<Note[]>([])
  const searchLoading = ref(false)

  const activeNote = computed(
    () => notes.value.find((n) => n.id === activeNoteId.value) ?? null,
  )

  const activeBody = computed(
    () =>
      bodies.value.find((b) => b.id === activeBodyId.value) ?? null,
  )

  function bodiesForNote(noteId: string): NoteBody[] {
    return bodies.value
      .filter((b) => b.note_id === noteId)
      .slice()
      .sort((a, b) => a.position - b.position)
  }

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
      const fromStore = filterNotesBySubstring(notes.value, bodies.value, q)
      const byId = new Map<string, Note>()
      for (const n of fromApi) byId.set(n.id, n)
      for (const n of fromStore) byId.set(n.id, n)
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
    await chrome.storage.local.set({
      [NOTES_CACHE_KEY]: notes.value,
      [NOTE_BODIES_CACHE_KEY]: bodies.value,
    })
  }

  async function loadAll(): Promise<void> {
    loadError.value = null
    try {
      const cached = await chrome.storage.local.get([
        NOTES_CACHE_KEY,
        NOTE_BODIES_CACHE_KEY,
      ])
      const rawNotes = cached[NOTES_CACHE_KEY] as Note[] | undefined
      const rawBodies = cached[NOTE_BODIES_CACHE_KEY] as NoteBody[] | undefined
      if (Array.isArray(rawNotes) && rawNotes.length > 0) {
        notes.value = rawNotes
      }
      if (Array.isArray(rawBodies) && rawBodies.length > 0) {
        bodies.value = rawBodies
      }
      const [freshNotes, freshBodies] = await Promise.all([
        notesService.getAll(),
        noteBodiesService.getAll(),
      ])
      notes.value = freshNotes
      bodies.value = freshBodies
      await persistCache()
      await useSecureFolderStore().refreshDecryptedNotesAfterLoad()
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : 'Load notes failed'
      const cached = await chrome.storage.local.get([
        NOTES_CACHE_KEY,
        NOTE_BODIES_CACHE_KEY,
      ])
      const rawNotes = cached[NOTES_CACHE_KEY] as Note[] | undefined
      const rawBodies = cached[NOTE_BODIES_CACHE_KEY] as NoteBody[] | undefined
      if (Array.isArray(rawNotes) && rawNotes.length > 0) {
        notes.value = rawNotes
      }
      if (Array.isArray(rawBodies) && rawBodies.length > 0) {
        bodies.value = rawBodies
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
    let bodyLabel = ''
    let bodyContent = ''
    if (folder?.is_secure && key) {
      title = await encryptField('', key)
      bodyLabel = await encryptField('', key)
      bodyContent = await encryptField('', key)
    }
    const note = await notesService.create({
      title,
      folder_id: folderId,
      tags: [],
    })
    const bodyRow = await noteBodiesService.create(note.id, {
      label: bodyLabel,
      content: bodyContent,
      position: 0,
    })
    let storedNote = note
    let storedBody = bodyRow
    if (folder?.is_secure && key) {
      storedNote = {
        ...note,
        title: await decryptField(note.title, key),
      }
      storedBody = {
        ...bodyRow,
        label: await decryptField(bodyRow.label, key),
        content: await decryptField(bodyRow.content, key),
      }
    }
    notes.value = [storedNote, ...notes.value]
    bodies.value = [storedBody, ...bodies.value]
    activeNoteId.value = storedNote.id
    activeBodyId.value = storedBody.id
    isDirty.value = false
    await persistCache()
    return storedNote
  }

  async function updateNote(
    id: string,
    updates: Partial<Pick<Note, 'title' | 'folder_id' | 'tags'>>,
  ): Promise<void> {
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const idx = notes.value.findIndex((n) => n.id === id)
    const prev = idx === -1 ? null : notes.value[idx]
    if (!prev) return

    const folderId =
      updates.folder_id !== undefined ? updates.folder_id : prev.folder_id
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null

    let payload: Partial<Pick<Note, 'title' | 'folder_id' | 'tags'>> = {
      ...updates,
    }

    if (folder?.is_secure) {
      const k = secure.getKey(folderId!)
      if (!k) throw new Error('Folder locked')
      if (payload.title !== undefined) {
        payload.title = await encryptField(payload.title, k)
      }
    }

    const data = await notesService.update(id, payload)
    const merged: Note = { ...prev, ...data }

    if (folder?.is_secure) {
      const k = secure.getKey(folderId!)
      if (k) {
        notes.value[idx] = {
          ...merged,
          title: await decryptField(data.title, k),
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

  async function updateBody(
    id: string,
    updates: Partial<Pick<NoteBody, 'label' | 'content'>>,
  ): Promise<void> {
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const idx = bodies.value.findIndex((b) => b.id === id)
    const prev = idx === -1 ? null : bodies.value[idx]
    if (!prev) return

    const note = notes.value.find((n) => n.id === prev.note_id)
    const folderId = note?.folder_id ?? null
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null

    let payload: Partial<Pick<NoteBody, 'label' | 'content'>> = { ...updates }

    if (folder?.is_secure) {
      const k = secure.getKey(folderId!)
      if (!k) throw new Error('Folder locked')
      if (payload.label !== undefined) {
        payload.label = await encryptField(payload.label, k)
      }
      if (payload.content !== undefined) {
        payload.content = await encryptField(payload.content, k)
      }
    }

    const data = await noteBodiesService.update(id, payload)
    const merged: NoteBody = { ...prev, ...data }

    if (folder?.is_secure) {
      const k = secure.getKey(folderId!)
      if (k) {
        bodies.value[idx] = {
          ...merged,
          label: await decryptField(data.label, k),
          content: await decryptField(data.content, k),
        }
      } else {
        bodies.value[idx] = merged
      }
    } else {
      bodies.value[idx] = merged
    }
    isDirty.value = false
    await persistCache()
  }

  async function createBodyForNote(noteId: string): Promise<NoteBody> {
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const note = notes.value.find((n) => n.id === noteId)
    if (!note) throw new Error('Note not found')
    const folderId = note.folder_id
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null
    const key =
      folderId && folder?.is_secure ? secure.getKey(folderId) : null
    if (folder?.is_secure && !key) {
      throw new Error('Folder locked')
    }
    const list = bodiesForNote(noteId)
    const position = list.length === 0 ? 0 : Math.max(...list.map((b) => b.position)) + 1
    let label = ''
    let content = ''
    if (folder?.is_secure && key) {
      label = await encryptField('', key)
      content = await encryptField('', key)
    }
    const row = await noteBodiesService.create(noteId, {
      label,
      content,
      position,
    })
    let stored = row
    if (folder?.is_secure && key) {
      stored = {
        ...row,
        label: await decryptField(row.label, key),
        content: await decryptField(row.content, key),
      }
    }
    bodies.value = [...bodies.value, stored]
    activeBodyId.value = stored.id
    await persistCache()
    return stored
  }

  async function deleteBody(id: string): Promise<void> {
    const prev = bodies.value.find((b) => b.id === id)
    if (!prev) return
    const sibs = bodiesForNote(prev.note_id)
    if (sibs.length <= 1) {
      await deleteNote(prev.note_id)
      return
    }
    await noteBodiesService.delete(id)
    bodies.value = bodies.value.filter((b) => b.id !== id)
    if (activeBodyId.value === id) {
      const rest = bodiesForNote(prev.note_id)
      activeBodyId.value = rest[0]?.id ?? null
    }
    await persistCache()
  }

  async function deleteNote(id: string): Promise<void> {
    await notesService.delete(id)
    notes.value = notes.value.filter((n) => n.id !== id)
    bodies.value = bodies.value.filter((b) => b.note_id !== id)
    if (activeNoteId.value === id) activeNoteId.value = null
    if (activeBodyId.value && !bodies.value.some((b) => b.id === activeBodyId.value)) {
      activeBodyId.value = null
    }
    await persistCache()
  }

  /**
   * Chọn note. `preferredBodyId`: khi chọn body cụ thể (cột BODY).
   */
  function selectNote(
    id: string | null,
    preferredBodyId?: string | null,
  ): void {
    if (id && searchQuery.value.trim()) clearSearch()
    activeNoteId.value = id
    if (!id) {
      activeBodyId.value = null
      return
    }
    const n = notes.value.find((x) => x.id === id)
    if (n?.folder_id) {
      useFoldersStore().alignActiveFolderToNoteFolder(n.folder_id)
    }
    const bs = bodiesForNote(id)
    if (bs.length === 0) {
      activeBodyId.value = null
      return
    }
    if (
      preferredBodyId &&
      bs.some((b) => b.id === preferredBodyId)
    ) {
      activeBodyId.value = preferredBodyId
      return
    }
    const stillValid =
      activeBodyId.value &&
      bs.some((b) => b.id === activeBodyId.value)
    if (!stillValid) {
      activeBodyId.value = bs[0]?.id ?? null
    }
  }

  function selectBody(bodyId: string | null): void {
    activeBodyId.value = bodyId
  }

  function setDirty(value: boolean): void {
    isDirty.value = value
  }

  return {
    notes,
    bodies,
    activeNoteId,
    activeBodyId,
    activeNote,
    activeBody,
    isDirty,
    loadError,
    filterTag,
    searchQuery,
    searchResults,
    searchLoading,
    bodiesForNote,
    notesForFolder,
    runSearch,
    clearSearch,
    setFilterTag,
    loadAll,
    createNote,
    createBodyForNote,
    updateNote,
    updateBody,
    deleteNote,
    deleteBody,
    selectNote,
    selectBody,
    setDirty,
    persistCache,
  }
})
