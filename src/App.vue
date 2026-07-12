<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import { supabase } from '@/services/supabase'
import {
  applyCalendarOverflowSelections,
  detectCalendarDayOverflow,
  type CalendarDayKeepSelection,
  type CalendarOverflowReport,
} from '@/services/localFirst/calendarOverflowResolver.service'
import {
  prepareSyncWithConflictCheck,
  pushLocalToCloud,
  type SyncStrategy,
  type ConflictReport,
} from '@/services/localFirst/syncEngine.service'
import {
  ensureLocalDataOwnership,
  type OwnershipCheckResult,
} from '@/services/localFirst/dataOwner.service'
import CalendarOverflowResolverDialog from '@/components/sync/CalendarOverflowResolverDialog.vue'
import PostLoginSyncToast from '@/components/sync/PostLoginSyncToast.vue'
import SyncConflictDialog from '@/components/sync/SyncConflictDialog.vue'
import type { SyncResult } from '@/types/localFirst'
import { BBQ_DATA_OWNER_USER_ID_KEY } from '@/constants/storage'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useCalendarEventsStore } from '@/stores/calendarEvents'

const conflictReport = ref<ConflictReport | null>(null)
const conflictDialogVisible = ref(false)
const calendarOverflowReport = ref<CalendarOverflowReport | null>(null)
const calendarOverflowVisible = ref(false)
const syncResult = ref<SyncResult | null>(null)
const toastVisible = ref(false)

let unsubAuth: (() => void) | null = null
let selfOwnerChange = false

function onOwnerKeyChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
): void {
  if (area !== 'local' || !changes[BBQ_DATA_OWNER_USER_ID_KEY]) return
  const { oldValue, newValue } = changes[BBQ_DATA_OWNER_USER_ID_KEY]
  // first-login (undefined→X) và set-lại-cùng-giá-trị: không reload.
  if (oldValue === undefined || newValue === undefined || oldValue === newValue) return
  if (selfOwnerChange) return // context này là nơi vừa login — runSyncFlow tự xử lý
  // N3.1: account đổi ở context khác — toàn bộ Pinia state ở đây là của account cũ.
  // Reload là cách duy nhất chắc chắn không persist/push lại data cũ.
  window.location.reload()
}

/**
 * Reload store data from Supabase after a successful sync so the UI reflects
 * the newly-pushed data. BookmarkTab is not included here because it has PIN
 * unlock logic — it will reload naturally when the user opens the tab (v-if remount).
 * Calendar events store is included so counts and lists stay in sync after login push.
 */
async function reloadAfterSync(): Promise<void> {
  await Promise.all([
    useFoldersStore().loadAll(),
    useNotesStore().loadAll(),
    useCalendarEventsStore().loadAll(),
  ])
}

async function handleConflictResolve(strategy: SyncStrategy): Promise<void> {
  conflictDialogVisible.value = false
  if (strategy === 'cancel') {
    conflictReport.value = null
    return
  }

  try {
    const result = await pushLocalToCloud(strategy)
    syncResult.value = result
    await reloadAfterSync()
    toastVisible.value = true
    setTimeout(() => (toastVisible.value = false), 5000)
  } catch (e) {
    console.error('[BBQOne] Sync failed after conflict resolve:', e)
  }
  conflictReport.value = null
}

async function finishPushLocalSync(): Promise<void> {
  const report = await prepareSyncWithConflictCheck()
  if (report.totalConflicts === 0) {
    const result = await pushLocalToCloud('use-local')
    syncResult.value = result
    await reloadAfterSync()
    toastVisible.value = true
    setTimeout(() => (toastVisible.value = false), 5000)
    return
  }
  conflictReport.value = report
  conflictDialogVisible.value = true
}

async function runSyncFlow(): Promise<void> {
  selfOwnerChange = true
  try {
    // N3: xác định chủ local data TRƯỚC mọi push. Fail-safe: không xác định được → KHÔNG push.
    let ownership: OwnershipCheckResult
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      ownership = await ensureLocalDataOwnership(user.id)
    } catch (e) {
      console.error('[BBQOne] Ownership check failed — skip auto-push:', e)
      return
    }
    if (ownership.status === 'foreign-stashed' && !ownership.restoredOwnStash) {
      // Data local thuộc account khác — đã stash + purge. Chỉ pull data account mới.
      await reloadAfterSync()
      return
    }
    try {
      const overflow = await detectCalendarDayOverflow()
      if (overflow.days.length > 0) {
        calendarOverflowReport.value = overflow
        calendarOverflowVisible.value = true
        return
      }
      await finishPushLocalSync()
    } catch (e) {
      console.error('[BBQOne] Sync pre-flight failed:', e)
      try {
        const result = await pushLocalToCloud('use-local')
        syncResult.value = result
        await reloadAfterSync()
        toastVisible.value = true
        setTimeout(() => (toastVisible.value = false), 5000)
      } catch (err) {
        console.error('[BBQOne] Sync fallback failed:', err)
      }
    }
  } finally {
    selfOwnerChange = false
  }
}

async function handleCalendarOverflowSave(
  selections: CalendarDayKeepSelection[],
): Promise<void> {
  calendarOverflowVisible.value = false
  try {
    await applyCalendarOverflowSelections(selections)
    calendarOverflowReport.value = null
    await finishPushLocalSync()
  } catch (e) {
    console.error('[BBQOne] Calendar overflow resolve failed:', e)
    calendarOverflowReport.value = null
  }
}

function handleCalendarOverflowCancel(): void {
  calendarOverflowVisible.value = false
  calendarOverflowReport.value = null
}

onMounted(() => {
  chrome.storage.onChanged.addListener(onOwnerKeyChanged)
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      void runSyncFlow()
    }
  })
  unsubAuth = () => data.subscription.unsubscribe()
})

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(onOwnerKeyChanged)
  unsubAuth?.()
})
</script>

<template>
  <RouterView class="app-root" />
  <CalendarOverflowResolverDialog
    v-if="calendarOverflowReport"
    :report="calendarOverflowReport"
    :visible="calendarOverflowVisible"
    @save="handleCalendarOverflowSave"
    @cancel="handleCalendarOverflowCancel"
  />
  <SyncConflictDialog
    v-if="conflictReport"
    :report="conflictReport"
    :visible="conflictDialogVisible"
    @resolve="handleConflictResolve"
  />
  <PostLoginSyncToast
    :result="syncResult"
    :visible="toastVisible"
    @close="toastVisible = false"
  />
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 100%;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}
</style>
