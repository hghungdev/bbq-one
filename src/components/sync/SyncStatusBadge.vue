<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { localDictionaryService } from '@/services/localFirst/localDictionary.service'
import { localNotesService } from '@/services/localFirst/localNotes.service'
import { localBookmarksService } from '@/services/localFirst/localBookmarks.service'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { useLangStore } from '@/stores/uiLang'

const { t } = useLangStore()
const pendingCount = ref(0)
const visible = ref(false)

async function refresh(): Promise<void> {
  if (await isAuthenticated()) {
    visible.value = false
    pendingCount.value = 0
    return
  }
  const [dict, notes, bookmarks] = await Promise.all([
    localDictionaryService.pendingSyncCount(),
    localNotesService.pendingSyncCount(),
    localBookmarksService.pendingSyncCount(),
  ])
  pendingCount.value = dict + notes + bookmarks
  visible.value = pendingCount.value > 0
}

function onStorageChanged(): void {
  void refresh()
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
  <div v-if="visible" class="sync-badge" role="status">
    <span class="sync-badge__dot" aria-hidden="true" />
    {{ t('sync.pending', { n: pendingCount }) }}
  </div>
</template>

<style scoped>
.sync-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border: 1px solid var(--accent);
  font-size: var(--font-size-sm);
  font-family: 'IBM Plex Mono', 'JetBrains Mono', monospace;
  color: var(--accent);
  background: transparent;
  letter-spacing: 0.04em;
}

.sync-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  animation: badge-pulse 2s infinite;
}

@keyframes badge-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
