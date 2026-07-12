import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SyncStatus } from '@/types'
import { syncService } from '@/services/sync.service'
import { isOnline } from '@/services/networkReachability.service'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useSecureFolderStore } from '@/stores/secureFolder'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { hasLocalFirstPending } from '@/services/autoSync.service'
import { pushLocalToCloud } from '@/services/localFirst/syncEngine.service'
import { getCurrentUserId, isAuthenticated } from '@/services/localFirst/authMode'
import { isPushAllowedFor } from '@/services/localFirst/dataOwner.service'

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
    const calendarEvents = useCalendarEventsStore()
    lastError.value = null
    markSyncing()
    try {
      // N3.1: data local thuộc account khác → không push, báo lỗi rõ thay vì "synced" giả.
      if (!(await isPushAllowedFor(await getCurrentUserId().catch(() => null)))) {
        markError('Local data belongs to another account — reopen the app to finish account switch.')
        return
      }
      // N7b: note/event TẠO offline nằm trong bbqone_local_* — phải push, không thì badge "synced" là giả.
      if ((await isAuthenticated()) && (await hasLocalFirstPending())) {
        const pushResult = await pushLocalToCloud('use-local')
        // N3.1: partial fail không được phép thành "synced" xanh.
        if (pushResult.errors.length > 0) {
          throw new Error(`Sync incomplete: ${pushResult.errors.length} item(s) failed`)
        }
      }
      await syncService.syncDirtyNotesFromList(
        notes.notes,
        notes.bodies,
        folders.folders,
        (id) => secure.getKey(id),
      )
      // N7b: calendar cũng phải sync tay được — trước đây chỉ notes.
      await syncService.syncDirtyCalendarEventsFromList(calendarEvents.events)
      await Promise.all([notes.loadAll(), calendarEvents.loadAll()])
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
