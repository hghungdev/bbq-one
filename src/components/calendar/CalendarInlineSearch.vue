<script setup lang="ts">
import InlineSearch from '@/components/ui/InlineSearch.vue'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useLangStore } from '@/stores/uiLang'

/**
 * U2: tìm kiếm của tab Calendar nằm ngay trong hàng điều hướng tháng — mặc định chỉ là nút 🔍.
 * U5: hành vi (debounce, Esc, mở sẵn, Ctrl+F) nằm ở ui/InlineSearch dùng chung với Notes / Bookmark.
 * Danh sách kết quả vẫn là CalendarSearchPanel.
 */
const store = useCalendarEventsStore()
const { t } = useLangStore()
</script>

<template>
  <InlineSearch
    input-id="bbqone-calendar-search"
    :query="store.searchQuery"
    :focus-request="store.searchFocusRequest"
    :placeholder="t('search.placeholderCalendar')"
    :input-label="t('search.ariaCalendar')"
    :open-label="t('calendar.search.open')"
    :close-label="t('calendar.search.close')"
    @search="(q) => store.setSearchQuery(q)"
    @clear="store.clearCalendarSearch()"
  />
</template>
