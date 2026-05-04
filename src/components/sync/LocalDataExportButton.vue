<script setup lang="ts">
import { localStore } from '@/services/localFirst/localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import { useLangStore } from '@/stores/uiLang'

const { t } = useLangStore()

async function exportLocal(): Promise<void> {
  const data: Record<string, unknown[]> = {}
  for (const [name, key] of Object.entries(LOCAL_STORAGE_KEYS)) {
    data[name] = await localStore.getArray(key)
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `bbqone-local-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()

  URL.revokeObjectURL(url)
}
</script>

<template>
  <button class="export-btn" type="button" @click="exportLocal">
    {{ t('sync.export') }}
  </button>
</template>

<style scoped>
.export-btn {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-family: 'IBM Plex Mono', 'JetBrains Mono', monospace;
  font-size: var(--font-size-sm);
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: border-color 0.15s, color 0.15s;
}

.export-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
