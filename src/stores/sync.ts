import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SyncStatus } from '@/types'
import { syncService } from '@/services/sync.service'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useSecureFolderStore } from '@/stores/secureFolder'

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus>('idle')
  const lastError = ref<string | null>(null)

  async function runManualSync(): Promise<void> {
    const notes = useNotesStore()
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    lastError.value = null
    status.value = 'syncing'
    try {
      await syncService.syncDirtyNotesFromList(
        notes.notes,
        notes.bodies,
        folders.folders,
        (id) => secure.getKey(id),
      )
      await notes.loadAll()
      status.value = 'synced'
    } catch (e) {
      status.value = 'error'
      lastError.value = e instanceof Error ? e.message : 'Sync failed'
      throw e
    }
  }

  return { status, lastError, runManualSync }
})
