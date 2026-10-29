<script setup lang="ts">
import { computed } from 'vue'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { CALENDAR_CELL_EVENT_LIMIT } from '@/constants/calendar'
import { useLangStore } from '@/stores/uiLang'
import { formatLocalDate, isPastLocalDay, normalizeLocalDateKey, todayLocalKey } from '@/utils/calendarDate'
import { calendarEventToneClass } from '@/utils/calendarEventTone'

const props = defineProps<{ date: Date; isCurrentMonth: boolean }>()
const store = useCalendarEventsStore()
const { t } = useLangStore()

const dateKey = computed(() => formatLocalDate(props.date))
const isToday = computed(() => dateKey.value === todayLocalKey())
const isPastDay = computed(() => isPastLocalDay(dateKey.value))
const events = computed(() => store.eventsMatchingSearchForDate(dateKey.value))
const visibleEvents = computed(() => events.value.slice(0, CALENDAR_CELL_EVENT_LIMIT))
const overflowCount = computed(() =>
  Math.max(0, events.value.length - CALENDAR_CELL_EVENT_LIMIT),
)
const isSearchFocusDay = computed(() => {
  const gfk = store.gridFocusDateKey
  return gfk !== null && normalizeLocalDateKey(gfk) === dateKey.value
})

const isModalTargetDay = computed(() => {
  const ad = store.activeDate
  return ad !== null && normalizeLocalDateKey(ad) === dateKey.value
})

function onCellClick(): void {
  if (isPastDay.value) return
  store.openModalForDate(dateKey.value)
}

function onEventClick(e: Event): void {
  e.stopPropagation()
  store.openModalForDate(dateKey.value)
}

/** U30: "+n xem thêm" → hộp của ngày liệt kê đủ — cả ngày đã qua (bấm khoảng trống ô đã qua vẫn không mở). */
function onMoreClick(e: Event): void {
  e.stopPropagation()
  store.openModalForDate(dateKey.value)
}
</script>

<template>
  <div
    class="cal-cell"
    :data-cal-date="dateKey"
    :class="{
      'cal-cell--other-month': !isCurrentMonth,
      'cal-cell--today': isToday,
      'cal-cell--past': isPastDay,
      'cal-cell--modal-target': isModalTargetDay,
      'cal-cell--search-focus': isSearchFocusDay,
    }"
    :title="isPastDay ? t('calendar.cell.pastTitle') : undefined"
    @click="onCellClick"
  >
    <div class="cal-cell__day">{{ date.getDate() }}</div>
    <ul class="cal-cell__events">
      <li
        v-for="ev in visibleEvents"
        :key="ev.id"
        class="cal-cell__event"
        :class="[
          calendarEventToneClass(ev.id),
          { 'cal-cell__event--done': ev.is_done },
        ]"
        :title="ev.title.trim() || undefined"
        @click="onEventClick($event)"
      >
        <span class="cal-cell__event-title">{{ ev.title }}</span>
      </li>
      <li v-if="overflowCount > 0" class="cal-cell__more-row">
        <button
          type="button"
          class="cal-cell__more"
          :title="t('calendar.cell.moreTitle', { n: events.length })"
          @click="onMoreClick($event)"
        >
          {{ t('calendar.cell.more', { n: overflowCount }) }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cal-cell {
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 6px 6px 6px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  overflow-anchor: none;
  cursor: pointer;
  background: var(--bg-secondary);
  transition:
    background 0.12s ease,
    box-shadow 0.12s ease;
}

.cal-cell:hover:not(.cal-cell--past) {
  background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
}

.cal-cell--past {
  cursor: default;
  background: var(--bg-primary);
}

.cal-cell--past .cal-cell__day,
.cal-cell--other-month .cal-cell__day {
  color: var(--text-muted);
}

.cal-cell--other-month .cal-cell__event,
.cal-cell--other-month .cal-cell__more {
  opacity: 0.62;
}

.cal-cell--today {
  background: var(--accent-soft-bg);
  box-shadow: inset 0 0 0 1px var(--accent-soft-border), inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

/* U11: số ngày hôm nay trong vòng tròn màu nhấn (kiểu lịch hiện đại). */
.cal-cell--today .cal-cell__day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 700;
}

.cal-cell--modal-target {
  box-shadow: inset 0 0 0 2px var(--accent), inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
  background: var(--surface-accent-muted, var(--bg-secondary));
}

.cal-cell--search-focus {
  box-shadow: inset 0 0 0 2px var(--calendar-search-focus-border);
  background: var(--calendar-search-focus-bg);
}

.cal-cell--today.cal-cell--search-focus {
  box-shadow: inset 0 0 0 2px var(--calendar-search-focus-border);
}

.cal-cell__day {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.cal-cell__events {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.cal-cell__event {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  font-size: var(--font-size-sm);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    filter 0.12s ease;
}

.cal-cell--past .cal-cell__event {
  cursor: pointer;
}

.cal-cell--past .cal-cell__event:hover {
  filter: brightness(1.02);
}

.cal-cell__event--done .cal-cell__event-title {
  text-decoration: line-through;
}

.cal-cell__more-row {
  flex: 0 0 auto;
  display: flex;
  min-width: 0;
}

/* U32: thẻ "+n xem thêm" là một dòng của danh sách — rộng hết cột, cùng bo góc + lề chữ với pill (chữ thẳng cột
   tên sự kiện); viền đứt, nền trong, thấp hơn pill để vẫn là nút phụ. Bấm được cả ở ngày đã qua (U30). */
.cal-cell__more {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 24px;
  margin: 0;
  /* trái 10 px = vạch màu 3 px của pill + 8 px − viền 1 px → chữ thẳng cột tên sự kiện; phải 6 px + đậm 500 để
     "+4 xem thêm" vừa cột ~90 px (đậm 600 / lề 8 px tràn 0,2 px → bị cắt "…") */
  padding: 3px 6px 3px 10px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: 500;
  line-height: 1.3;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}

.cal-cell__more:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.cal-cell__more:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
