<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { localNotesService } from '@/services/localFirst/localNotes.service'
import { localBookmarksService } from '@/services/localFirst/localBookmarks.service'
import { localCalendarEventsService } from '@/services/localFirst/localCalendarEvents.service'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { useLangStore } from '@/stores/uiLang'

const emit = defineEmits<{
  'sign-in': []
}>()

const { t } = useLangStore()
const pendingCount = ref(0)
const visible = ref(false)

const countLabel = computed(() => {
  const n = pendingCount.value
  return n > 99 ? '99+' : String(n)
})

const statusLabel = computed(() => t('sync.pending', { n: pendingCount.value }))

async function refresh(): Promise<void> {
  if (await isAuthenticated()) {
    visible.value = false
    pendingCount.value = 0
    return
  }
  const [notes, bookmarks, cal] = await Promise.all([
    localNotesService.pendingSyncCount(),
    localBookmarksService.pendingSyncCount(),
    localCalendarEventsService.pendingSyncCount(),
  ])
  pendingCount.value = notes + bookmarks + cal
  visible.value = pendingCount.value > 0
}

function onStorageChanged(): void {
  void refresh()
}

function onActivate(): void {
  emit('sign-in')
}

onMounted(() => {
  void refresh()
  chrome.storage.onChanged.addListener(onStorageChanged)
})

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(onStorageChanged)
})
</script>

<template>
  <button
    v-if="visible"
    type="button"
    class="sync-pending-badge"
    role="status"
    :aria-label="statusLabel"
    :title="statusLabel"
    @click="onActivate"
  >
    <svg
      class="sync-pending-badge__cloud"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M17.5 19H9a7 7 0 1 1 6.71-9.5A5 5 0 0 1 17.5 19Z"
      />
    </svg>
    <span class="sync-pending-badge__bubble" aria-hidden="true">{{ countLabel }}</span>
  </button>
</template>

<style scoped>
.sync-pending-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 28px;
  padding: 0;
  margin: 0;
  border: 1px solid var(--accent-soft-border);
  border-radius: var(--radius-pill);
  background: var(--surface-accent-muted);
  color: var(--accent);
  cursor: pointer;
  transition:
    background 0.12s linear,
    border-color 0.12s linear;
}

.sync-pending-badge:hover {
  border-color: var(--accent);
  background: var(--accent-soft-bg-hover);
}

.sync-pending-badge:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.sync-pending-badge__cloud {
  display: block;
}

.sync-pending-badge__bubble {
  position: absolute;
  top: -5px;
  right: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--bg-secondary);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  font-family: var(--font-body);
  letter-spacing: 0;
  box-shadow: 0 1px 2px var(--panel-ring);
}
</style>
