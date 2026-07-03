import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { NOTE_BODIES_CACHE_KEY, NOTES_CACHE_KEY } from '@/constants/storage'
import { noteBodiesService } from '@/services/noteBodies.service'
import { filterNotesBySubstring, notesService } from '@/services/notes.service'
import {
  localNoteBodiesService,
  localNotesService,
} from '@/services/localFirst/localNotes.service'
import { useFoldersStore } from '@/stores/folders'
import { useSecureFolderStore } from '@/stores/secureFolder'
import type { Note, NoteBody } from '@/types'
import { decryptField, encryptField } from '@/utils/secureCrypto'
import { withTimeout } from '@/utils/withTimeout'
import { isNetworkError } from '@/utils/networkErrors'
import { isSyncConflictError, nextLocalUpdatedAt } from '@/utils/syncConflict'
import { scheduleAutoSync } from '@/services/autoSync.service'
import { isOnline } from '@/services/networkReachability.service'
import { isRowDirty, mergeFreshWithDirtyLocal } from '@/services/sync.service'
import { useUndoToastStore } from '@/stores/undoToast'
import { useLangStore } from '@/stores/uiLang'

const NETWORK_LOAD_MS = 12_000

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

  async function hydrateFromCache(): Promise<void> {
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

  async function loadAll(): Promise<void> {
    loadError.value = null
    try {
      await hydrateFromCache()
      if (!isOnline()) return
      const [freshNotes, freshBodies] = await withTimeout(
        Promise.all([notesService.getAll(), noteBodiesService.getAll()]),
        NETWORK_LOAD_MS,
        'Load notes timed out',
      )
      // Không đè row đang dirty (sửa offline chưa push) bằng bản server cũ.
      notes.value = mergeFreshWithDirtyLocal(freshNotes, notes.value, isRowDirty)
      bodies.value = mergeFreshWithDirtyLocal(freshBodies, bodies.value, isRowDirty)
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

  async function createNote(folderId: string | null, initialTitle = ''): Promise<Note> {
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null
    const key =
      folderId && folder?.is_secure ? secure.getKey(folderId) : null
    if (folder?.is_secure && !key) {
      throw new Error('Folder locked')
    }
    let title = initialTitle.trim()
    let bodyLabel = ''
    let bodyContent = ''
    if (folder?.is_secure && key) {
      title = await encryptField('', key)
      bodyLabel = await encryptField('', key)
      bodyContent = await encryptField('', key)
    }
    let note: Note
    let bodyRow: NoteBody
    let createdOffline = false
    try {
      note = await notesService.create({
        title,
        folder_id: folderId,
        tags: [],
      })
      bodyRow = await noteBodiesService.create(note.id, {
        label: bodyLabel,
        content: bodyContent,
        position: 0,
      })
    } catch (e) {
      // Offline / network fail: ghi vào LocalFirst storage để autoSync push sau.
      // KHÔNG mất dữ liệu user vừa tạo.
      if (isOnline() && !isNetworkError(e)) throw e
      const localNote = await localNotesService.create({
        title,
        folder_id: folderId,
        tags: [],
      })
      const localBody = await localNoteBodiesService.create(localNote.id, {
        label: bodyLabel,
        content: bodyContent,
        position: 0,
      })
      note = { ...localNote, user_id: '' } as Note
      bodyRow = { ...localBody, user_id: '' } as NoteBody
      createdOffline = true
    }
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
    isDirty.value = createdOffline
    await persistCache()
    if (createdOffline) scheduleAutoSync('note-create-offline')
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

    try {
      const data = await notesService.update(id, payload, {
        row: prev,
        retryOnConflictWithServerState: true,
      })
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
    } catch (e) {
      if (isSyncConflictError(e)) throw e
      if (isOnline() && !isNetworkError(e)) throw e
      const ts = nextLocalUpdatedAt(prev)
      notes.value[idx] = { ...prev, ...updates, updated_at: ts }
      isDirty.value = true
      await persistCache()
      scheduleAutoSync('note-offline')
    }
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

    try {
      const data = await noteBodiesService.update(id, payload, {
        row: prev,
        retryOnConflictWithServerState: true,
      })
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
    } catch (e) {
      if (isSyncConflictError(e)) throw e
      if (isOnline() && !isNetworkError(e)) throw e
      const ts = nextLocalUpdatedAt(prev)
      bodies.value[idx] = {
        ...prev,
        label: updates.label ?? prev.label,
        content: updates.content ?? prev.content,
        updated_at: ts,
      }
      const noteIdx = notes.value.findIndex((n) => n.id === prev.note_id)
      if (noteIdx !== -1) {
        notes.value[noteIdx] = { ...notes.value[noteIdx], updated_at: ts }
      }
      isDirty.value = true
      await persistCache()
      scheduleAutoSync('body-offline')
    }
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
    let row: NoteBody
    let createdOffline = false
    try {
      row = await noteBodiesService.create(noteId, {
        label,
        content,
        position,
      })
    } catch (e) {
      if (isOnline() && !isNetworkError(e)) throw e
      const localBody = await localNoteBodiesService.create(noteId, {
        label,
        content,
        position,
      })
      row = { ...localBody, user_id: '' } as NoteBody
      createdOffline = true
    }
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
    if (createdOffline) scheduleAutoSync('body-create-offline')
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

  async function deleteNote(
    id: string,
    options: { undoable?: boolean } = {},
  ): Promise<void> {
    const undoable = options.undoable ?? true
    if (undoable) {
      await scheduleDeleteNote(id)
      return
    }
    await deleteNoteImmediately(id)
  }

  async function deleteNoteImmediately(id: string): Promise<void> {
    await notesService.delete(id)
    notes.value = notes.value.filter((n) => n.id !== id)
    bodies.value = bodies.value.filter((b) => b.note_id !== id)
    if (activeNoteId.value === id) activeNoteId.value = null
    if (activeBodyId.value && !bodies.value.some((b) => b.id === activeBodyId.value)) {
      activeBodyId.value = null
    }
    await persistCache()
  }

  async function scheduleDeleteNote(id: string): Promise<void> {
    const noteIndex = notes.value.findIndex((n) => n.id === id)
    const note = noteIndex === -1 ? null : {
      ...notes.value[noteIndex],
      tags: notes.value[noteIndex].tags.slice(),
    }
    if (!note) return
    const folders = useFoldersStore()
    const folder = note.folder_id
      ? folders.folders.find((f) => f.id === note.folder_id)
      : null
    const noteBodies = bodies.value
      .map((body, index) => ({ body: { ...body }, index }))
      .filter(({ body }) => body.note_id === id)
    const searchResultIndex = searchResults.value.findIndex((n) => n.id === id)
    const wasInSearchResults = searchResultIndex !== -1
    const prevSearchQuery = searchQuery.value
    const prevActiveNoteId = activeNoteId.value
    const prevActiveBodyId = activeBodyId.value

    notes.value = notes.value.filter((n) => n.id !== id)
    bodies.value = bodies.value.filter((b) => b.note_id !== id)
    searchResults.value = searchResults.value.filter((n) => n.id !== id)
    if (activeNoteId.value === id) activeNoteId.value = null
    if (activeBodyId.value && !bodies.value.some((b) => b.id === activeBodyId.value)) {
      activeBodyId.value = null
    }
    await persistCache()

    const undoToast = useUndoToastStore()
    const { t } = useLangStore()
    await undoToast.schedule({
      id: `note:${id}`,
      message: t('undo.noteDeleted', {
        title: note.title.trim() || t('notes.untitled'),
        folder: folder?.name ?? t('undo.noFolder'),
      }),
      undo: async () => {
        restoreNoteSnapshot(note, noteIndex, noteBodies)
        if (wasInSearchResults && searchQuery.value === prevSearchQuery) {
          restoreSearchResultSnapshot(note, searchResultIndex)
        }
        if (activeNoteId.value === null && prevActiveNoteId === id) {
          activeNoteId.value = prevActiveNoteId
        }
        if (activeBodyId.value === null && prevActiveBodyId) {
          activeBodyId.value = prevActiveBodyId
        }
        await persistCache()
      },
      commit: async () => {
        try {
          await notesService.delete(id)
        } catch (e) {
          if (isNetworkError(e)) {
            loadError.value = e instanceof Error ? e.message : 'Delete note failed'
            throw e
          }
          restoreNoteSnapshot(note, noteIndex, noteBodies)
          if (wasInSearchResults && searchQuery.value === prevSearchQuery) {
            restoreSearchResultSnapshot(note, searchResultIndex)
          }
          if (activeNoteId.value === null && prevActiveNoteId === id) {
            activeNoteId.value = prevActiveNoteId
          }
          if (activeBodyId.value === null && prevActiveBodyId) {
            activeBodyId.value = prevActiveBodyId
          }
          loadError.value = e instanceof Error ? e.message : 'Delete note failed'
          await persistCache()
          return
        }
        if (noteBodies.length > 0) {
          await persistCache()
        }
      },
    })
  }

  function restoreNoteSnapshot(
    note: Note,
    noteIndex: number,
    noteBodies: { body: NoteBody; index: number }[],
  ): void {
    if (!notes.value.some((n) => n.id === note.id)) {
      const nextNotes = notes.value.slice()
      nextNotes.splice(Math.min(Math.max(noteIndex, 0), nextNotes.length), 0, note)
      notes.value = nextNotes
    }

    let nextBodies = bodies.value.slice()
    for (const { body, index } of noteBodies) {
      if (nextBodies.some((b) => b.id === body.id)) continue
      nextBodies.splice(Math.min(Math.max(index, 0), nextBodies.length), 0, body)
    }
    bodies.value = nextBodies
  }

  function restoreSearchResultSnapshot(note: Note, index: number): void {
    if (searchResults.value.some((n) => n.id === note.id)) return
    const next = searchResults.value.slice()
    next.splice(Math.min(Math.max(index, 0), next.length), 0, note)
    searchResults.value = next
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
    hydrateFromCache,
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
