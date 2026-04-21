<script setup lang="ts">
import { onMounted } from 'vue'
import { useDictionaryStore } from '@/stores/dictionary'
import { useLangStore } from '@/stores/uiLang'
import DictionarySearchBar from './DictionarySearchBar.vue'
import DictionaryEntryItem from './DictionaryEntryItem.vue'

const store = useDictionaryStore()
const { t } = useLangStore()

onMounted(() => {
  void store.loadAll()
})
</script>

<template>
  <div class="dict-tab">
    <!-- Header bar with count -->
    <div class="dict-tab__header">
      <span class="dict-tab__title">{{ t('dict.title') }}</span>
      <span class="dict-tab__count">({{ store.totalCount }})</span>
    </div>

    <!-- Search -->
    <DictionarySearchBar v-model="store.searchQuery" />

    <!-- States -->
    <div v-if="store.loading" class="dict-tab__state">
      {{ t('app.loading') }}<span class="retro-loading__dots"><span>.</span><span>.</span><span>.</span></span>
    </div>

    <div v-else-if="store.loadError" class="dict-tab__state dict-tab__state--error">
      [ERROR] {{ store.loadError }}
    </div>

    <div
      v-else-if="!store.filteredEntries.length"
      class="dict-tab__state dict-tab__state--empty"
    >
      <template v-if="store.searchQuery">
        {{ t('dict.noMatches', { q: store.searchQuery }) }}
      </template>
      <template v-else>
        {{ t('dict.empty') }}
      </template>
    </div>

    <!-- Entry list -->
    <div v-else class="dict-tab__list">
      <DictionaryEntryItem
        v-for="entry in store.filteredEntries"
        :key="entry.id"
        :entry="entry"
        @delete="store.removeEntry(entry.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.dict-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.dict-tab__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
  background: var(--bg-secondary);
}

.dict-tab__title {
  color: var(--accent);
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em;
}

.dict-tab__count {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

/* ── States ── */
.dict-tab__state {
  flex: 1 1 auto;
  padding: 20px 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.dict-tab__state--error {
  color: var(--danger);
}

.dict-tab__state--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── List ── */
.dict-tab__list {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}

/* Retro loading dots (reuses global animation pattern) */
.retro-loading__dots {
  display: inline;
}

.retro-loading__dots span {
  animation: retro-dot-blink 1.2s step-end infinite;
}

.retro-loading__dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.retro-loading__dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes retro-dot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>
