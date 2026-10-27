<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useLangStore } from '@/stores/uiLang'

/**
 * U2: tìm kiếm của tab Calendar nằm ngay trong hàng điều hướng tháng — mặc định chỉ là nút 🔍
 * (thay cho SearchBar toàn chiều ngang trên header). Danh sách kết quả vẫn là CalendarSearchPanel.
 */
const store = useCalendarEventsStore()
const { t } = useLangStore()

/** Còn query (vd quay lại tab Calendar) → mở sẵn để user thấy bộ lọc đang bật. */
const open = ref(store.searchQuery.trim().length > 0)
const localQuery = ref(store.searchQuery)
const inputRef = ref<InstanceType<typeof RetroInput> | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(localQuery, (v) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    store.setSearchQuery(v)
  }, 300)
})

watch(
  () => store.searchQuery,
  (q) => {
    if (q !== localQuery.value) localQuery.value = q
  },
)

// Ctrl+F ở tab Calendar (pages/App.vue → requestSearchFocus).
watch(
  () => store.searchFocusRequest,
  () => {
    void openSearch()
  },
)

async function openSearch(): Promise<void> {
  open.value = true
  await nextTick()
  inputRef.value?.focus()
}

function closeSearch(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  localQuery.value = ''
  store.clearCalendarSearch()
  open.value = false
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  closeSearch()
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="cal-inline-search" :class="{ 'cal-inline-search--open': open }">
    <template v-if="open">
      <RetroInput
        id="bbqone-calendar-search"
        ref="inputRef"
        v-model="localQuery"
        class="cal-inline-search__input"
        :placeholder="t('search.placeholderCalendar')"
        :aria-label="t('search.ariaCalendar')"
        autocomplete="off"
        @keydown="onKeydown"
      />
      <IconButton variant="default" :label="t('calendar.search.close')" :title="t('calendar.search.close')" @click="closeSearch">
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
    </template>
    <IconButton
      v-else
      variant="default"
      :label="t('calendar.search.open')"
      :title="t('calendar.search.open')"
      @click="openSearch"
    >
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.75" />
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          d="M16 16l4.5 4.5"
        />
      </svg>
    </IconButton>
  </div>
</template>

<style scoped>
.cal-inline-search {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.cal-inline-search__input {
  width: clamp(140px, 30vw, 260px);
  padding-top: 7px;
  padding-bottom: 7px;
}
</style>
