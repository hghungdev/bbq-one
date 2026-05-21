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
import CalendarOverflowResolverDialog from '@/components/sync/CalendarOverflowResolverDialog.vue'
import PostLoginSyncToast from '@/components/sync/PostLoginSyncToast.vue'
import SyncConflictDialog from '@/components/sync/SyncConflictDialog.vue'
import type { SyncResult } from '@/types/localFirst'
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
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      void runSyncFlow()
    }
  })
  unsubAuth = () => data.subscription.unsubscribe()
})

onUnmounted(() => {
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
