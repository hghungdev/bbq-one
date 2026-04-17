<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useNotesStore } from '@/stores/notes'

const props = defineProps<{
  /** Tab đang mở — quyết định ô search áp dụng cho notes hay bookmark. */
  searchMode: 'notes' | 'bookmarks'
}>()

const notes = useNotesStore()
const bookmarks = useBookmarksStore()

const localQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => notes.searchQuery,
  (q) => {
    if (props.searchMode === 'notes' && localQuery.value !== q) localQuery.value = q
  },
)

watch(
  () => bookmarks.searchQuery,
  (q) => {
    if (props.searchMode === 'bookmarks' && localQuery.value !== q) localQuery.value = q
  },
)

watch(
  () => props.searchMode,
  (mode) => {
    localQuery.value = mode === 'notes' ? notes.searchQuery : bookmarks.searchQuery
  },
)

watch(localQuery, (v) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (props.searchMode === 'notes') {
      void notes.runSearch(v)
    } else {
      bookmarks.setSearchQuery(v)
    }
  }, 300)
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

function onClear(): void {
  localQuery.value = ''
  if (props.searchMode === 'notes') {
    notes.clearSearch()
  } else {
    bookmarks.clearBookmarkSearch()
  }
}

function focusInput(): void {
  document.getElementById('bbqnote-search')?.focus()
}

defineExpose({ focusInput })

onMounted(() => {
  localQuery.value = props.searchMode === 'notes' ? notes.searchQuery : bookmarks.searchQuery
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
      :aria-label="searchMode === 'notes' ? 'Search notes' : 'Search bookmarks'"
    />
    <RetroButton variant="sm" type="button" @click="onClear">
      [ X ]
    </RetroButton>
    <span v-if="searchMode === 'notes' && notes.searchLoading" class="search-bar__state">…</span>
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
