import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { FOLDERS_CACHE_KEY } from '@/constants/storage'
import { foldersService } from '@/services/folders.service'
import { useNotesStore } from '@/stores/notes'
import type { Folder } from '@/types'

function sortFoldersByUpdatedDesc(list: Folder[]): Folder[] {
  return list.slice().sort((a, b) => {
    const tb = new Date(b.updated_at ?? b.created_at).getTime()
    const ta = new Date(a.updated_at ?? a.created_at).getTime()
    return tb - ta
  })
}

export const useFoldersStore = defineStore('folders', () => {
  const folders = ref<Folder[]>([])
  const activeFolderId = ref<string | null>(null)
  const loadError = ref<string | null>(null)

  const activeFolder = computed(
    () => folders.value.find((f) => f.id === activeFolderId.value) ?? null,
  )

  async function persistCache(): Promise<void> {
    await chrome.storage.local.set({ [FOLDERS_CACHE_KEY]: folders.value })
  }

  async function loadAll(): Promise<void> {
    loadError.value = null
    try {
      const cached = await chrome.storage.local.get(FOLDERS_CACHE_KEY)
      const raw = cached[FOLDERS_CACHE_KEY] as Folder[] | undefined
      if (Array.isArray(raw) && raw.length > 0) {
        folders.value = raw
      }
      const fresh = await foldersService.getAll()
      folders.value = sortFoldersByUpdatedDesc(fresh)
      await persistCache()
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : 'Load folders failed'
      const cached = await chrome.storage.local.get(FOLDERS_CACHE_KEY)
      const raw = cached[FOLDERS_CACHE_KEY] as Folder[] | undefined
      if (Array.isArray(raw) && raw.length > 0) {
        folders.value = raw
      }
    }
  }

  function selectFolder(id: string | null): void {
    const notesStore = useNotesStore()
    notesStore.clearSearch()
    if (activeFolderId.value === id) return
    activeFolderId.value = id
    notesStore.selectNote(null)
  }

  /** Đổi folder đang chọn mà không xóa note (vd. chọn note từ kết quả search global). */
  function alignActiveFolderToNoteFolder(folderId: string | null): void {
    if (folderId && activeFolderId.value !== folderId) {
      activeFolderId.value = folderId
    }
  }

  /** Note không có folder_id → không coi là secure. */
  function isSecureFolder(folderId: string | null): boolean {
    if (!folderId) return false
    return folders.value.find((f) => f.id === folderId)?.is_secure ?? false
  }

  async function createFolder(name: string): Promise<Folder> {
    useNotesStore().clearSearch()
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('Folder name required')
    }
    const position =
      folders.value.length === 0
        ? 0
        : Math.max(...folders.value.map((f) => f.position)) + 1
    const folder = await foldersService.create(trimmed, position)
    folders.value = sortFoldersByUpdatedDesc([...folders.value, folder])
    activeFolderId.value = folder.id
    useNotesStore().selectNote(null)
    await persistCache()
    return folder
  }

  async function renameFolder(id: string, name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('Folder name required')
    }
    const data = await foldersService.update(id, { name: trimmed })
    const idx = folders.value.findIndex((f) => f.id === id)
    if (idx !== -1) folders.value[idx] = data
    folders.value = sortFoldersByUpdatedDesc(folders.value)
    await persistCache()
  }

  /**
   * Xóa folder + toàn bộ notes trong folder + bodies (notesService.delete → CASCADE note_bodies trên DB).
   */
  async function deleteFolder(id: string): Promise<void> {
    const notesStore = useNotesStore()
    const noteIds = notesStore.notes
      .filter((n) => n.folder_id === id)
      .map((n) => n.id)
    for (const noteId of noteIds) {
      await notesStore.deleteNote(noteId)
    }
    await foldersService.delete(id)
    folders.value = folders.value.filter((f) => f.id !== id)
    notesStore.clearSearch()
    await persistCache()
  }

  watch(
    () => folders.value.map((f) => f.id).join(','),
    () => {
      const list = folders.value
      if (list.length === 0) {
        activeFolderId.value = null
        return
      }
      if (
        activeFolderId.value !== null &&
        !list.some((f) => f.id === activeFolderId.value)
      ) {
        activeFolderId.value = list[0].id
        return
      }
      if (activeFolderId.value === null) {
        activeFolderId.value = list[0].id
      }
    },
  )

  return {
    folders,
    activeFolderId,
    activeFolder,
    loadError,
    loadAll,
    selectFolder,
    alignActiveFolderToNoteFolder,
    isSecureFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    persistCache,
    reorderFoldersByUpdated: (): void => {
      folders.value = sortFoldersByUpdatedDesc(folders.value)
    },
  }
})
