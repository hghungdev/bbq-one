<script setup lang="ts">
import { computed } from 'vue'
import { buildMonthGrid, formatLocalDate } from '@/utils/calendarDate'
import { useLangStore } from '@/stores/uiLang'
import CalendarCell from '@/components/calendar/CalendarCell.vue'

const props = defineProps<{ year: number; month: number }>()
const { t } = useLangStore()

const cells = computed(() => buildMonthGrid(props.year, props.month))

const weekdayLabels = computed(() => [
  t('calendar.weekday.mon'),
  t('calendar.weekday.tue'),
  t('calendar.weekday.wed'),
  t('calendar.weekday.thu'),
  t('calendar.weekday.fri'),
  t('calendar.weekday.sat'),
  t('calendar.weekday.sun'),
])

function isCurrentMonth(d: Date): boolean {
  return d.getFullYear() === props.year && d.getMonth() === props.month
}
</script>

<template>
  <div class="cal-grid">
    <div class="cal-grid__weekdays">
      <div v-for="w in weekdayLabels" :key="w" class="cal-grid__weekday">{{ w }}</div>
    </div>
    <div class="cal-grid__cells">
      <CalendarCell
        v-for="d in cells"
        :key="formatLocalDate(d)"
        :date="d"
        :is-current-month="isCurrentMonth(d)"
      />
    </div>
  </div>
</template>

<style scoped>
.cal-grid {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.cal-grid__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}

.cal-grid__weekday {
  padding: 6px 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  text-align: left;
}

.cal-grid__cells {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(104px, 1fr);
  flex: 1 1 auto;
  min-height: 0;
}
</style>
