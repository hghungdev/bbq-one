<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  addMonths,
  normalizeLocalDateKey,
  parseLocalDate,
  todayLocalKey,
} from '@/utils/calendarDate'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useLangStore } from '@/stores/uiLang'
import CalendarMonthNav from '@/components/calendar/CalendarMonthNav.vue'
import CalendarGrid from '@/components/calendar/CalendarGrid.vue'
import CalendarEventModal from '@/components/calendar/CalendarEventModal.vue'
import CalendarSearchPanel from '@/components/calendar/CalendarSearchPanel.vue'
import type { CalendarEvent } from '@/types/calendar'

const store = useCalendarEventsStore()
const { activeDate } = storeToRefs(store)
const { t } = useLangStore()

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth())
/** Chỉ cuộn trong khối này — tránh scrollIntoView kéo cả popup làm mất thanh tháng. */
const gridScrollRef = ref<HTMLElement | null>(null)

onMounted(() => {
  scrollToTodayInView('auto')
})

function syncGridMonthToDateKey(raw: string): void {
  const dateKey = normalizeLocalDateKey(raw)
  if (!dateKey || dateKey.length < 10) return
  const d = parseLocalDate(dateKey)
  if (Number.isNaN(d.getTime())) return
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
}

/** Pinia: watch ref trực tiếp — đảm bảo đổi tháng khi mở modal (ô / search / sửa). */
watch(activeDate, (dateKey) => {
  if (!dateKey) return
  syncGridMonthToDateKey(dateKey)
})

function isViewingCurrentMonth(): boolean {
  const d = new Date()
  return viewYear.value === d.getFullYear() && viewMonth.value === d.getMonth()
}

/** Cuộn ô ngày vào giữa vùng lưới (không kéo cả popup). */
async function scrollCalendarCellIntoView(
  dateKey: string,
  behavior: ScrollBehavior = 'smooth',
): Promise<void> {
  const key = normalizeLocalDateKey(dateKey)
  await nextTick()
  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
  const scrollRoot = gridScrollRef.value
  if (!scrollRoot) return
  const cell = scrollRoot.querySelector<HTMLElement>(`[data-cal-date="${key}"]`)
  if (!cell) return
  const rootRect = scrollRoot.getBoundingClientRect()
  const cellRect = cell.getBoundingClientRect()
  const deltaY =
    cellRect.top + cellRect.height / 2 - (rootRect.top + rootRect.height / 2)
  scrollRoot.scrollBy({ top: deltaY, behavior })
}

function scrollToTodayInView(behavior: ScrollBehavior): void {
  if (!isViewingCurrentMonth()) return
  void scrollCalendarCellIntoView(todayLocalKey(), behavior)
}

function gotoPrev(): void {
  const { year, month } = addMonths(viewYear.value, viewMonth.value, -1)
  viewYear.value = year
  viewMonth.value = month
}

function gotoNext(): void {
  const { year, month } = addMonths(viewYear.value, viewMonth.value, 1)
  viewYear.value = year
  viewMonth.value = month
}

function gotoToday(): void {
  const d = new Date()
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
  scrollToTodayInView('smooth')
}

watch(
  () => store.gridFocusDateKey,
  (dateKey) => {
    if (!dateKey) return
    syncGridMonthToDateKey(dateKey)
    void scrollCalendarCellIntoView(dateKey, 'smooth')
  },
)

function jumpToEvent(ev: CalendarEvent): void {
  const key = normalizeLocalDateKey(ev.event_date)
  store.focusCalendarCellFromSearch(key)
  store.setSearchQuery('')
}
</script>

<template>
  <div class="calendar-tab">
    <CalendarMonthNav
      :year="viewYear"
      :month="viewMonth"
      @prev="gotoPrev"
      @next="gotoNext"
      @today="gotoToday"
    />
    <CalendarSearchPanel @pick="jumpToEvent" />
    <div ref="gridScrollRef" class="calendar-tab__grid-scroll">
      <CalendarGrid :year="viewYear" :month="viewMonth" />
    </div>
    <CalendarEventModal v-if="store.activeDate" />
    <p v-if="store.loadError" class="calendar-tab__error">
      {{ t('common.error') }} {{ store.loadError }}
    </p>
  </div>
</template>

<style scoped>
.calendar-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.calendar-tab__grid-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.calendar-tab__error {
  padding: 8px 12px;
  color: var(--danger);
  font-size: var(--font-size-sm);
}
</style>
