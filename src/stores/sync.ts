import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SyncStatus } from '@/types'
import { syncService } from '@/services/sync.service'
import { useNotesStore } from '@/stores/notes'

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus>('idle')
  const lastError = ref<string | null>(null)

  async function runManualSync(): Promise<void> {
    const notes = useNotesStore()
    lastError.value = null
    status.value = 'syncing'
    try {
      await syncService.syncDirtyNotesFromList(notes.notes)
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
