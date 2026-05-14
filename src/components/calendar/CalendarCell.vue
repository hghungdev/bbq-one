<script setup lang="ts">
import { computed } from 'vue'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { CALENDAR_CELL_EVENT_LIMIT } from '@/constants/calendar'
import { useLangStore } from '@/stores/uiLang'
import { formatLocalDate, isPastLocalDay, normalizeLocalDateKey, todayLocalKey } from '@/utils/calendarDate'

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
const isCalendarFocusDay = computed(() => {
  const key = dateKey.value
  const gfk = store.gridFocusDateKey
  if (gfk && normalizeLocalDateKey(gfk) === key) return true
  const ad = store.activeDate
  if (ad && normalizeLocalDateKey(ad) === key) return true
  return false
})

function onCellClick(): void {
  if (isPastDay.value) return
  store.openModalForDate(dateKey.value)
}

function onEventClick(id: string, e: Event): void {
  e.stopPropagation()
  store.openModalForEdit(id)
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
      'cal-cell--modal-target': isCalendarFocusDay,
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
        :class="{ 'cal-cell__event--done': ev.is_done }"
        @click="onEventClick(ev.id, $event)"
      >
        <span class="cal-cell__event-title">{{ ev.title }}</span>
      </li>
      <li v-if="overflowCount > 0" class="cal-cell__overflow">+{{ overflowCount }}</li>
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
  min-height: 0;
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-primary);
}

.cal-cell:hover:not(.cal-cell--past) {
  background: var(--bg-secondary);
}

.cal-cell--past {
  cursor: default;
  background: var(--bg-panel);
}

.cal-cell--past .cal-cell__day {
  color: var(--text-muted);
}

.cal-cell--other-month {
  opacity: 0.45;
}

.cal-cell--today {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.cal-cell--modal-target {
  box-shadow: inset 0 0 0 2px var(--accent);
  background: var(--surface-accent-muted, var(--bg-secondary));
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
  background: var(--surface-accent-muted, var(--bg-panel));
  font-size: var(--font-size-sm);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.cal-cell__event:hover {
  border-color: var(--accent);
}

.cal-cell--past .cal-cell__event {
  cursor: pointer;
}

.cal-cell--past .cal-cell__event:hover {
  border-color: var(--accent);
}

.cal-cell__event--done {
  opacity: 0.5;
  text-decoration: line-through;
}

.cal-cell__overflow {
  flex: 0 0 auto;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  padding: 2px 6px;
  line-height: 1.3;
}
</style>
