<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { localNotesService } from '@/services/localFirst/localNotes.service'
import { localBookmarksService } from '@/services/localFirst/localBookmarks.service'
import { localCalendarEventsService } from '@/services/localFirst/localCalendarEvents.service'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { useLangStore } from '@/stores/uiLang'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import { BBQ_AUTH_LOGGED_IN_KEY } from '@/constants/storage'

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

/** P5: chỉ kho máy (`bbqone_local_*`) và cờ đăng nhập mới đổi số mục chờ — không phải cache, bản nháp (session)… */
const WATCHED_KEYS = new Set<string>([...Object.values(LOCAL_STORAGE_KEYS), BBQ_AUTH_LOGGED_IN_KEY])
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function onStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
): void {
  if (area !== 'local' || !Object.keys(changes).some((k) => WATCHED_KEYS.has(k))) return
  // Gộp nhịp: một thao tác thường ghi nhiều khóa liền nhau → đọc lại kho một lần.
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refresh()
  }, 250)
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
  if (refreshTimer) clearTimeout(refreshTimer)
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
/* U21: nút icon phẳng (không viền / nền); ☁ màu nhấn + bong bóng số đủ nổi. */
.sync-pending-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  transition: background 0.12s linear;
}

.sync-pending-badge:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
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
  top: -2px;
  right: -3px;
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
