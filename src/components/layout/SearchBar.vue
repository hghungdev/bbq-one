<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useNotesStore } from '@/stores/notes'

const notes = useNotesStore()

const localQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

/* clearSearch() từ store (folder / tạo folder) phải xóa cả ô input */
watch(
  () => notes.searchQuery,
  (q) => {
    if (localQuery.value !== q) localQuery.value = q
  },
)

watch(localQuery, (v) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void notes.runSearch(v)
  }, 300)
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

function onClear(): void {
  localQuery.value = ''
  notes.clearSearch()
}

function focusInput(): void {
  document.getElementById('bbqnote-search')?.focus()
}

defineExpose({ focusInput })

onMounted(() => {
  localQuery.value = notes.searchQuery
})
</script>

<template>
  <div class="search-bar">
    <span class="search-bar__label" aria-hidden="true">SEARCH</span>
    <RetroInput
      id="bbqnote-search"
      v-model="localQuery"
      placeholder="> query_"
      autocomplete="off"
      aria-label="Search notes"
    />
    <RetroButton variant="sm" type="button" @click="onClear">
      [ X ]
    </RetroButton>
    <span v-if="notes.searchLoading" class="search-bar__state">…</span>
  </div>
</template>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.search-bar__label {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.search-bar :deep(.retro-input) {
  flex: 1 1 160px;
  min-width: 120px;
}

.search-bar__state {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
</style>
