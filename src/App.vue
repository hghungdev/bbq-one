<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import { supabase } from '@/services/supabase'
import {
  prepareSyncWithConflictCheck,
  pushLocalToCloud,
  type SyncStrategy,
  type ConflictReport,
} from '@/services/localFirst/syncEngine.service'
import PostLoginSyncToast from '@/components/sync/PostLoginSyncToast.vue'
import SyncConflictDialog from '@/components/sync/SyncConflictDialog.vue'
import type { SyncResult } from '@/types/localFirst'

const conflictReport = ref<ConflictReport | null>(null)
const conflictDialogVisible = ref(false)
const syncResult = ref<SyncResult | null>(null)
const toastVisible = ref(false)

let unsubAuth: (() => void) | null = null

async function handleConflictResolve(strategy: SyncStrategy): Promise<void> {
  conflictDialogVisible.value = false
  if (strategy === 'cancel') {
    conflictReport.value = null
    return
  }

  try {
    const result = await pushLocalToCloud(strategy)
    syncResult.value = result
    toastVisible.value = true
    setTimeout(() => (toastVisible.value = false), 5000)
  } catch (e) {
    console.error('[BBQOne] Sync failed after conflict resolve:', e)
  }
  conflictReport.value = null
}

async function runSyncFlow(): Promise<void> {
  try {
    // Bước 1: phát hiện conflict trước khi sync
    const report = await prepareSyncWithConflictCheck()

    // Bước 2: không có conflict → auto-sync ngay (preserve UX cũ)
    if (report.totalConflicts === 0) {
      const result = await pushLocalToCloud('use-local')
      syncResult.value = result
      toastVisible.value = true
      setTimeout(() => (toastVisible.value = false), 5000)
      return
    }

    // Bước 3: có conflict → hiện dialog để user chọn chiến lược
    conflictReport.value = report
    conflictDialogVisible.value = true
  } catch (e) {
    console.error('[BBQOne] Sync pre-flight failed:', e)
    // Fallback: thử sync bình thường không check conflict
    try {
      const result = await pushLocalToCloud('use-local')
      syncResult.value = result
      toastVisible.value = true
      setTimeout(() => (toastVisible.value = false), 5000)
    } catch (err) {
      console.error('[BBQOne] Sync fallback failed:', err)
    }
  }
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
