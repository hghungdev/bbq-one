import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SyncStatus } from '@/types'
import { syncService } from '@/services/sync.service'
import { isOnline } from '@/services/networkReachability.service'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useSecureFolderStore } from '@/stores/secureFolder'

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus>('idle')
  const lastError = ref<string | null>(null)
  let syncedResetTimer: ReturnType<typeof setTimeout> | null = null

  function clearSyncedResetTimer(): void {
    if (syncedResetTimer === null) return
    clearTimeout(syncedResetTimer)
    syncedResetTimer = null
  }

  function markSynced(): void {
    clearSyncedResetTimer()
    status.value = 'synced'
    syncedResetTimer = setTimeout(() => {
      if (status.value === 'synced') {
        status.value = 'idle'
      }
      syncedResetTimer = null
    }, 5000)
  }

  function markSyncing(): void {
    clearSyncedResetTimer()
    status.value = 'syncing'
  }

  function markError(message: string): void {
    clearSyncedResetTimer()
    lastError.value = message
    status.value = 'error'
  }

  async function runManualSync(): Promise<void> {
    if (!isOnline()) {
      markError('Offline')
      throw new Error('Offline')
    }
    const notes = useNotesStore()
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    lastError.value = null
    markSyncing()
    try {
      await syncService.syncDirtyNotesFromList(
        notes.notes,
        notes.bodies,
        folders.folders,
        (id) => secure.getKey(id),
      )
      await notes.loadAll()
      markSynced()
    } catch (e) {
      markError(e instanceof Error ? e.message : 'Sync failed')
      throw e
    }
  }

  async function runAutoSync(): Promise<boolean> {
    if (!isOnline() || status.value === 'syncing') return false
    try {
      await runManualSync()
      return true
    } catch {
      return false
    }
  }

  return { status, lastError, markSynced, runManualSync, runAutoSync }
})
