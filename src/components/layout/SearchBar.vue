<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useNotesStore } from '@/stores/notes'
import { useLangStore } from '@/stores/uiLang'

const props = defineProps<{
  /** Tab đang mở — quyết định ô search áp dụng cho notes, bookmark hay calendar. */
  searchMode: 'notes' | 'bookmarks' | 'calendar'
}>()

const notes = useNotesStore()
const bookmarks = useBookmarksStore()
const calendar = useCalendarEventsStore()
const { t } = useLangStore()

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
  () => calendar.searchQuery,
  (q) => {
    if (props.searchMode === 'calendar' && localQuery.value !== q) localQuery.value = q
  },
)

watch(
  () => props.searchMode,
  (mode) => {
    if (mode === 'notes') localQuery.value = notes.searchQuery
    else if (mode === 'bookmarks') localQuery.value = bookmarks.searchQuery
    else localQuery.value = calendar.searchQuery
  },
)

watch(localQuery, (v) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (props.searchMode === 'notes') {
      void notes.runSearch(v)
    } else if (props.searchMode === 'bookmarks') {
      bookmarks.setSearchQuery(v)
    } else {
      calendar.setSearchQuery(v)
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
  } else if (props.searchMode === 'bookmarks') {
    bookmarks.clearBookmarkSearch()
  } else {
    calendar.clearCalendarSearch()
  }
}

function focusInput(): void {
  document.getElementById('bbqone-search')?.focus()
}

defineExpose({ focusInput })

function searchAriaLabel(): string {
  if (props.searchMode === 'notes') return t('search.ariaNotes')
  if (props.searchMode === 'bookmarks') return t('search.ariaBookmarks')
  return t('search.ariaCalendar')
}

onMounted(() => {
  if (props.searchMode === 'notes') localQuery.value = notes.searchQuery
  else if (props.searchMode === 'bookmarks') localQuery.value = bookmarks.searchQuery
  else localQuery.value = calendar.searchQuery
})
</script>

<template>
  <div class="search-bar">
    <span class="search-bar__label" aria-hidden="true">{{ t('search.label') }}</span>
    <RetroInput
      id="bbqone-search"
      v-model="localQuery"
      :placeholder="t('search.placeholder')"
      autocomplete="off"
      :aria-label="searchAriaLabel()"
    />
    <RetroButton variant="sm" type="button" @click="onClear">
      {{ t('common.bracketClear') }}
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
