<script setup lang="ts">
import { computed } from 'vue'
import type { SyncResult } from '@/types/localFirst'
import { useLangStore } from '@/stores/uiLang'
import IconButton from '@/components/ui/IconButton.vue'

const { t } = useLangStore()

const props = defineProps<{
  result: SyncResult | null
  visible: boolean
}>()

defineEmits<{ close: [] }>()

const hasSyncDetails = computed(() => {
  const result = props.result
  if (!result) return false
  return (
    result.pushedNotes > 0
    || result.pushedNoteBodies > 0
    || result.pushedFolders > 0
    || result.pushedBookmarks > 0
    || result.pushedCalendarEvents > 0
    || result.errors.length > 0
  )
})
</script>

<template>
  <Transition name="toast">
    <div v-if="visible && result" class="sync-toast" role="status" aria-live="polite">
      <div class="sync-toast__header" :class="{ 'sync-toast__header--solo': !hasSyncDetails }">
        <span class="sync-toast__title-wrap">
          <span class="sync-toast__title">{{ t('sync.complete') }}</span>
          <span class="sync-toast__meta">{{ result.durationMs }}ms</span>
        </span>
        <IconButton
          class="sync-toast__close"
          variant="default"
          :label="t('common.close')"
          @click="$emit('close')"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              d="M6 6l12 12M18 6L6 18"
            />
          </svg>
        </IconButton>
      </div>
      <div v-if="hasSyncDetails" class="sync-toast__body">
        <div v-if="result.pushedNotes > 0" class="sync-toast__line">
          {{ t('sync.notes', { n: result.pushedNotes }) }}
        </div>
        <div v-if="result.pushedNoteBodies > 0" class="sync-toast__line">
          {{ t('sync.noteBodies', { n: result.pushedNoteBodies }) }}
        </div>
        <div v-if="result.pushedFolders > 0" class="sync-toast__line">
          {{ t('sync.folders', { n: result.pushedFolders }) }}
        </div>
        <div v-if="result.pushedBookmarks > 0" class="sync-toast__line">
          {{ t('sync.bookmarks', { n: result.pushedBookmarks }) }}
        </div>
        <div v-if="result.pushedCalendarEvents > 0" class="sync-toast__line">
          {{ t('sync.calendar', { n: result.pushedCalendarEvents }) }}
        </div>
        <div
          v-if="result.errors.length > 0"
          class="sync-toast__line sync-toast__line--error"
        >
          {{ t('sync.errors', { n: result.errors.length }) }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sync-toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--success) 7%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 54px var(--panel-ring);
  padding: 10px;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  z-index: 9999;
  min-width: 240px;
  max-width: 320px;
}

.sync-toast__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 9px;
  gap: 12px;
}

.sync-toast__title-wrap {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.sync-toast__title {
  color: var(--text-primary);
  font-weight: 700;
  letter-spacing: -0.012em;
}

.sync-toast__meta {
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.2;
}

.sync-toast__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 9px 8px;
}

.sync-toast__line {
  color: var(--text-secondary);
}

.sync-toast__line--error {
  color: var(--danger);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
