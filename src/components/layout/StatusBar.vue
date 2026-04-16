<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotesStore } from '@/stores/notes'
import { useSyncStore } from '@/stores/sync'

const auth = useAuthStore()
const notes = useNotesStore()
const sync = useSyncStore()

const syncState = computed(() => {
  if (sync.status === 'syncing') return 'SYNCING...'
  if (notes.isDirty) return 'UNSAVED'
  if (sync.status === 'error') return 'SYNC FAILED'
  return 'SYNCED'
})

const line = computed(() => {
  const email = auth.user?.email ?? 'OFFLINE_'
  return `${email}                    ${syncState.value}`
})
</script>

<template>
  <footer class="status-bar" role="status">
    {{ line }}
  </footer>
</template>

<style scoped>
.status-bar {
  padding: 6px 10px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
