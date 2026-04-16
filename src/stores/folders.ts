import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { foldersService } from '@/services/folders.service'
import { useNotesStore } from '@/stores/notes'
import type { Folder } from '@/types'

const FOLDERS_CACHE_KEY = 'folders_cache'

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
      folders.value = fresh
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
    if (activeFolderId.value === id) return
    activeFolderId.value = id
    useNotesStore().selectNote(null)
  }

  async function createFolder(name: string): Promise<Folder> {
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('Folder name required')
    }
    const position =
      folders.value.length === 0
        ? 0
        : Math.max(...folders.value.map((f) => f.position)) + 1
    const folder = await foldersService.create(trimmed, position)
    folders.value = [...folders.value, folder].sort((a, b) => a.position - b.position)
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
    createFolder,
    renameFolder,
    persistCache,
  }
})
