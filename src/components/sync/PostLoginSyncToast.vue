<script setup lang="ts">
import type { SyncResult } from '@/types/localFirst'
import { useLangStore } from '@/stores/uiLang'

const { t } = useLangStore()

defineProps<{
  result: SyncResult | null
  visible: boolean
}>()

defineEmits<{ close: [] }>()
</script>

<template>
  <Transition name="toast">
    <div v-if="visible && result" class="sync-toast" role="status" aria-live="polite">
      <div class="sync-toast__header">
        <span class="sync-toast__title">{{ t('sync.complete') }}</span>
        <button
          class="sync-toast__close"
          type="button"
          :aria-label="'Close'"
          @click="$emit('close')"
        >✕</button>
      </div>
      <div class="sync-toast__body">
        <div v-if="result.pushedNotes > 0" class="sync-toast__line">
          {{ t('sync.notes', { n: result.pushedNotes }) }}
        </div>
        <div v-if="result.pushedNoteBodies > 0" class="sync-toast__line">
          + {{ result.pushedNoteBodies }} note bodies
        </div>
        <div v-if="result.pushedFolders > 0" class="sync-toast__line">
          + {{ result.pushedFolders }} folders
        </div>
        <div v-if="result.pushedBookmarks > 0" class="sync-toast__line">
          {{ t('sync.bookmarks', { n: result.pushedBookmarks }) }}
        </div>
        <div v-if="result.pushedDictionary > 0" class="sync-toast__line">
          {{ t('sync.dictionary', { n: result.pushedDictionary }) }}
        </div>
        <div
          v-if="result.errors.length > 0"
          class="sync-toast__line sync-toast__line--error"
        >
          {{ t('sync.errors', { n: result.errors.length }) }}
        </div>
        <div class="sync-toast__line sync-toast__line--meta">
          {{ result.durationMs }}ms
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
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  padding: 12px 16px;
  font-family: 'IBM Plex Mono', 'JetBrains Mono', monospace;
  font-size: var(--font-size-sm);
  z-index: 9999;
  min-width: 240px;
  max-width: 320px;
}

.sync-toast__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sync-toast__title {
  color: var(--accent);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.sync-toast__close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-sm);
  padding: 0 4px;
  line-height: 1;
}

.sync-toast__close:hover {
  color: var(--text-primary);
}

.sync-toast__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sync-toast__line {
  color: var(--text-secondary);
}

.sync-toast__line--error {
  color: var(--danger);
}

.sync-toast__line--meta {
  color: var(--text-muted);
  font-size: 10px;
  margin-top: 4px;
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
