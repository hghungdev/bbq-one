<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLangStore } from '@/stores/uiLang'
import { useSyncStore } from '@/stores/sync'
import { useNotesStore } from '@/stores/notes'
import {
  isOnline,
  onNetworkStatusChange,
} from '@/services/networkReachability.service'

type BannerState = 'hidden' | 'offline' | 'syncing' | 'synced'

const { t } = useLangStore()
const sync = useSyncStore()
const notes = useNotesStore()
const { isDirty } = storeToRefs(notes)

const networkOnline = ref(isOnline())
const wasOffline = ref(!networkOnline.value)
const showSyncedFlash = ref(false)
let stopNetworkListener: (() => void) | null = null
let syncedFlashTimer: ReturnType<typeof setTimeout> | null = null

const state = computed<BannerState>(() => {
  if (!networkOnline.value) return 'offline'
  if (wasOffline.value && (sync.status === 'syncing' || isDirty.value)) {
    return 'syncing'
  }
  if (showSyncedFlash.value) return 'synced'
  return 'hidden'
})

const visible = computed(() => state.value !== 'hidden')

const message = computed<{ title: string; body: string }>(() => {
  switch (state.value) {
    case 'offline':
      return {
        title: t('app.offlineBanner.title'),
        body: t('app.offlineBanner.body'),
      }
    case 'syncing':
      return {
        title: t('app.offlineBanner.syncing'),
        body: t('app.offlineBanner.body'),
      }
    case 'synced':
      return {
        title: t('app.offlineBanner.synced'),
        body: '',
      }
    default:
      return { title: '', body: '' }
  }
})

function clearSyncedFlash(): void {
  if (syncedFlashTimer !== null) {
    clearTimeout(syncedFlashTimer)
    syncedFlashTimer = null
  }
  showSyncedFlash.value = false
}

watch(
  () => sync.status,
  (status) => {
    if (status === 'synced' && wasOffline.value) {
      // Vừa sync xong sau khi online lại — flash 2.5s rồi ẩn.
      wasOffline.value = false
      showSyncedFlash.value = true
      if (syncedFlashTimer !== null) clearTimeout(syncedFlashTimer)
      syncedFlashTimer = setTimeout(clearSyncedFlash, 2500)
    }
  },
)

onMounted(() => {
  stopNetworkListener = onNetworkStatusChange((online) => {
    networkOnline.value = online
    if (!online) {
      wasOffline.value = true
      clearSyncedFlash()
    }
  })
})

onUnmounted(() => {
  stopNetworkListener?.()
  if (syncedFlashTimer !== null) clearTimeout(syncedFlashTimer)
})
</script>

<template>
  <Transition name="offline-banner">
    <div
      v-if="visible"
      class="offline-banner"
      :class="[`offline-banner--${state}`]"
      role="status"
      aria-live="polite"
    >
      <span class="offline-banner__icon" aria-hidden="true">
        <svg
          v-if="state === 'offline'"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 3l18 18M7.05 11.36a8 8 0 0 1 4.95-2.31m4.79 1.07A8 8 0 0 1 19 12M2 9a13 13 0 0 1 5.5-3.4m10.4 1.4A13 13 0 0 1 22 9"
          />
          <circle cx="12" cy="18" r="1.1" fill="currentColor" />
        </svg>
        <svg
          v-else-if="state === 'syncing'"
          class="offline-banner__spin"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5"
          />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5 12.5l4 4L19 6"
          />
        </svg>
      </span>
      <div class="offline-banner__text">
        <p class="offline-banner__title">{{ message.title }}</p>
        <p v-if="message.body" class="offline-banner__body">{{ message.body }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.offline-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 8px 12px 0;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.offline-banner--offline {
  border-color: color-mix(in srgb, var(--warning, #d97706) 38%, var(--border));
  background: color-mix(in srgb, var(--warning, #d97706) 8%, var(--bg-secondary));
  color: var(--text-primary);
}

.offline-banner--offline .offline-banner__icon {
  color: var(--warning, #d97706);
}

.offline-banner--syncing {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-secondary));
}

.offline-banner--syncing .offline-banner__icon {
  color: var(--accent);
}

.offline-banner--synced {
  border-color: color-mix(in srgb, var(--success, #16a34a) 38%, var(--border));
  background: color-mix(in srgb, var(--success, #16a34a) 8%, var(--bg-secondary));
}

.offline-banner--synced .offline-banner__icon {
  color: var(--success, #16a34a);
}

.offline-banner__icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-top: 1px;
}

.offline-banner__spin {
  animation: offline-banner-spin 1s linear infinite;
}

.offline-banner__text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.offline-banner__title {
  margin: 0;
  font-weight: 600;
  letter-spacing: -0.012em;
}

.offline-banner__body {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.4;
}

@keyframes offline-banner-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.offline-banner-enter-active,
.offline-banner-leave-active {
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.offline-banner-enter-from,
.offline-banner-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .offline-banner__spin {
    animation-duration: 2.4s;
  }
}
</style>
