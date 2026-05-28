<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  addMonths,
  buildMonthGrid,
  formatLocalDate,
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

/** Render sẵn ±2 tháng quanh tháng hiện tại để user cuộn mượt; title chỉ đổi khi
 *  qua ngưỡng nửa trang. Cửa sổ rộng giúp shiftVirtualMonth hiếm khi cần chạy
 *  trong lúc người dùng đang cuộn ⇒ giảm hẳn cảm giác giật. */
const MONTH_PAGE_OFFSETS = [-2, -1, 0, 1, 2] as const
type MonthPageOffset = (typeof MONTH_PAGE_OFFSETS)[number]
const PROGRAMMATIC_SCROLL_SUPPRESS_MS = 850
let monthVirtualizing = false
let programmaticScrollUntil = 0

const monthPages = computed(() =>
  MONTH_PAGE_OFFSETS.map((offset) => {
    const { year, month } = addMonths(viewYear.value, viewMonth.value, offset)
    return {
      key: `${year}-${month}`,
      year,
      month,
      offset: offset as MonthPageOffset,
    }
  }),
)

/** Bounds của mỗi trang để filter các tuần chồng lấp với trang kế bên,
 *  tránh hiển thị 2 lần cùng 1 tuần giữa các tháng liền kề. */
function monthGridBoundsFor(offset: MonthPageOffset): { start: string; end: string } {
  const { year, month } = addMonths(viewYear.value, viewMonth.value, offset)
  const cells = buildMonthGrid(year, month)
  const first = cells[0]
  const last = cells[cells.length - 1]
  return {
    start: first ? formatLocalDate(first) : '',
    end: last ? formatLocalDate(last) : '',
  }
}

/** Trang offset > 0 cắt tuần overlap với trang trước nó (về phía current = offset-1).
 *  Trang offset < 0 cắt tuần overlap với trang sau nó (về phía current = offset+1). */
function pageMinDateExclusive(offset: MonthPageOffset): string | undefined {
  if (offset <= 0) return undefined
  return monthGridBoundsFor((offset - 1) as MonthPageOffset).end
}

function pageMaxDateExclusive(offset: MonthPageOffset): string | undefined {
  if (offset >= 0) return undefined
  return monthGridBoundsFor((offset + 1) as MonthPageOffset).start
}

const weekdayLabels = computed(() => [
  t('calendar.weekday.mon'),
  t('calendar.weekday.tue'),
  t('calendar.weekday.wed'),
  t('calendar.weekday.thu'),
  t('calendar.weekday.fri'),
  t('calendar.weekday.sat'),
  t('calendar.weekday.sun'),
])

type ScrollAnchor = {
  dateKey: string
  deltaFromViewportCenter: number
}

onMounted(() => {
  void centerCurrentMonthPage().then(() => scrollToTodayInView('auto'))
})

function suppressProgrammaticScroll(ms = PROGRAMMATIC_SCROLL_SUPPRESS_MS): void {
  programmaticScrollUntil = Math.max(programmaticScrollUntil, Date.now() + ms)
}

function isProgrammaticScrollActive(): boolean {
  return Date.now() < programmaticScrollUntil
}

async function centerCurrentMonthPage(): Promise<void> {
  suppressProgrammaticScroll(160)
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const scrollRoot = gridScrollRef.value
  const currentPage = getMonthPage(0)
  if (!scrollRoot || !currentPage) return
  scrollRoot.scrollTop = Math.round(currentPage.offsetTop)
}

function getMonthPage(offset: MonthPageOffset): HTMLElement | null {
  return gridScrollRef.value?.querySelector<HTMLElement>(
    `[data-cal-month-offset="${offset}"]`,
  ) ?? null
}

function captureScrollAnchor(page: HTMLElement, scrollRoot: HTMLElement): ScrollAnchor | null {
  const cells = [...page.querySelectorAll<HTMLElement>('[data-cal-date]')]
  if (cells.length === 0) return null
  const rootRect = scrollRoot.getBoundingClientRect()
  const viewportCenter = rootRect.top + scrollRoot.clientHeight / 2
  let best: { cell: HTMLElement; distance: number } | null = null
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect()
    const cellCenter = rect.top + rect.height / 2
    const distance = Math.abs(cellCenter - viewportCenter)
    if (!best || distance < best.distance) {
      best = { cell, distance }
    }
  }
  const dateKey = best?.cell.dataset.calDate
  if (!best || !dateKey) return null
  const rect = best.cell.getBoundingClientRect()
  return {
    dateKey,
    deltaFromViewportCenter: rect.top + rect.height / 2 - viewportCenter,
  }
}

function restoreScrollAnchor(anchor: ScrollAnchor): void {
  const scrollRoot = gridScrollRef.value
  const currentPage = getMonthPage(0)
  if (!scrollRoot || !currentPage) return
  const cell = currentPage.querySelector<HTMLElement>(
    `[data-cal-date="${anchor.dateKey}"]`,
  )
  if (!cell) {
    scrollRoot.scrollTop = Math.round(currentPage.offsetTop)
    return
  }
  const rootRect = scrollRoot.getBoundingClientRect()
  const cellRect = cell.getBoundingClientRect()
  const viewportCenter = rootRect.top + scrollRoot.clientHeight / 2
  const currentDelta = cellRect.top + cellRect.height / 2 - viewportCenter
  // Math.round để tránh sub-pixel render gây cảm giác "rung" 1px khi shift.
  scrollRoot.scrollTop = Math.round(scrollRoot.scrollTop + (currentDelta - anchor.deltaFromViewportCenter))
}

function renderedPageOffsetForDateKey(dateKey: string): MonthPageOffset | null {
  const d = parseLocalDate(dateKey)
  if (Number.isNaN(d.getTime())) return null
  for (const offset of MONTH_PAGE_OFFSETS) {
    const { year, month } = addMonths(viewYear.value, viewMonth.value, offset)
    if (d.getFullYear() === year && d.getMonth() === month) return offset
  }
  return null
}

async function syncGridMonthToDateKey(raw: string, centerPage = true): Promise<void> {
  const dateKey = normalizeLocalDateKey(raw)
  if (!dateKey || dateKey.length < 10) return
  const d = parseLocalDate(dateKey)
  if (Number.isNaN(d.getTime())) return
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
  if (centerPage) await centerCurrentMonthPage()
}

/** Pinia: watch ref trực tiếp — đảm bảo đổi tháng khi mở modal (ô / search / sửa). */
watch(activeDate, (dateKey) => {
  if (!dateKey) return
  const normalized = normalizeLocalDateKey(dateKey)
  if (renderedPageOffsetForDateKey(normalized) !== null) return
  void syncGridMonthToDateKey(dateKey)
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
  const currentPage = getMonthPage(0)
  const cell = currentPage?.querySelector<HTMLElement>(`[data-cal-date="${key}"]`)
    ?? scrollRoot.querySelector<HTMLElement>(`[data-cal-date="${key}"]`)
  if (!cell) return
  const rootRect = scrollRoot.getBoundingClientRect()
  const cellRect = cell.getBoundingClientRect()
  const targetScrollTop =
    scrollRoot.scrollTop
    + cellRect.top
    - rootRect.top
    - (scrollRoot.clientHeight - cellRect.height) / 2
  const maxScrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight)
  const nextScrollTop = Math.min(Math.max(0, targetScrollTop), maxScrollTop)
  if (Math.abs(nextScrollTop - scrollRoot.scrollTop) < 1) return
  suppressProgrammaticScroll(behavior === 'smooth' ? PROGRAMMATIC_SCROLL_SUPPRESS_MS : 160)
  scrollRoot.scrollTo({ top: nextScrollTop, behavior })
}

function scrollToTodayInView(behavior: ScrollBehavior): void {
  if (!isViewingCurrentMonth()) return
  void scrollCalendarCellIntoView(todayLocalKey(), behavior)
}

function gotoPrev(): void {
  const { year, month } = addMonths(viewYear.value, viewMonth.value, -1)
  viewYear.value = year
  viewMonth.value = month
  void centerCurrentMonthPage()
}

function gotoNext(): void {
  const { year, month } = addMonths(viewYear.value, viewMonth.value, 1)
  viewYear.value = year
  viewMonth.value = month
  void centerCurrentMonthPage()
}

/** Khi qua mốc nửa trang tháng kế/cũ, đổi title và giữ nguyên vị trí tương đối.
 *  Ngưỡng dựa trên offsetHeight thực của trang (variable height) thay vì giả định
 *  mỗi trang = clientHeight, tránh trigger lặp khi viewport cao hơn 1 trang. */
function onGridScroll(): void {
  const el = gridScrollRef.value
  if (!el) return
  if (monthVirtualizing || isProgrammaticScrollActive()) return
  const previousPage = getMonthPage(-1)
  const currentPage = getMonthPage(0)
  const nextPage = getMonthPage(1)
  if (!previousPage || !currentPage || !nextPage) return
  const scrollTop = el.scrollTop
  const forwardTrigger = currentPage.offsetTop + currentPage.offsetHeight / 2
  const backwardTrigger = currentPage.offsetTop - previousPage.offsetHeight / 2
  if (scrollTop >= forwardTrigger) {
    void shiftVirtualMonth(1, captureScrollAnchor(nextPage, el))
    return
  }
  if (scrollTop < backwardTrigger) {
    void shiftVirtualMonth(-1, captureScrollAnchor(previousPage, el))
  }
}

async function shiftVirtualMonth(deltaMonths: -1 | 1, anchor: ScrollAnchor | null): Promise<void> {
  if (monthVirtualizing) return
  monthVirtualizing = true
  // Đặt suppress TRƯỚC khi mutate state để chặn inertia scroll event
  // (trackpad/touch) kích lại onGridScroll trong lúc DOM đang re-render.
  suppressProgrammaticScroll(280)
  if (deltaMonths > 0) {
    const { year, month } = addMonths(viewYear.value, viewMonth.value, 1)
    viewYear.value = year
    viewMonth.value = month
  } else {
    const { year, month } = addMonths(viewYear.value, viewMonth.value, -1)
    viewYear.value = year
    viewMonth.value = month
  }
  await nextTick()
  requestAnimationFrame(() => {
    const el = gridScrollRef.value
    const currentPage = getMonthPage(0)
    if (el && currentPage) {
      if (anchor) {
        restoreScrollAnchor(anchor)
      } else {
        el.scrollTop = currentPage.offsetTop
      }
    }
    suppressProgrammaticScroll(160)
    monthVirtualizing = false
  })
}

function gotoToday(): void {
  const d = new Date()
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
  void centerCurrentMonthPage().then(() => scrollToTodayInView('smooth'))
}

watch(
  () => store.gridFocusDateKey,
  async (dateKey) => {
    if (!dateKey) return
    await syncGridMonthToDateKey(dateKey)
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
    <div class="calendar-tab__weekdays">
      <div v-for="w in weekdayLabels" :key="w" class="calendar-tab__weekday">{{ w }}</div>
    </div>
    <div
      ref="gridScrollRef"
      class="calendar-tab__grid-scroll"
      @scroll.passive="onGridScroll"
    >
      <section
        v-for="page in monthPages"
        :key="page.key"
        class="calendar-tab__month-page"
        :class="{ 'calendar-tab__month-page--current': page.offset === 0 }"
        :data-cal-month-offset="page.offset"
      >
        <CalendarGrid
          :year="page.year"
          :month="page.month"
          :show-weekdays="false"
          :min-date-exclusive="pageMinDateExclusive(page.offset)"
          :max-date-exclusive="pageMaxDateExclusive(page.offset)"
        />
      </section>
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
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--accent) 4%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-primary);
}

.calendar-tab__grid-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  padding: 0 12px 12px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.calendar-tab__grid-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.calendar-tab__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  flex: 0 0 auto;
  margin: 0 12px;
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: color-mix(in srgb, var(--bg-panel) 74%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
  overflow: hidden;
}

.calendar-tab__weekday {
  padding: 6px 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  text-align: left;
}

.calendar-tab__month-page {
  display: block;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  background: var(--bg-secondary);
  overflow-anchor: none;
}

.calendar-tab__month-page + .calendar-tab__month-page {
  border-top: 1px solid var(--border);
}

.calendar-tab__error {
  padding: 8px 12px;
  color: var(--danger);
  font-size: var(--font-size-sm);
}
</style>
