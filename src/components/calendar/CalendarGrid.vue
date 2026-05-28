<script setup lang="ts">
import { computed } from 'vue'
import { buildMonthGrid, formatLocalDate } from '@/utils/calendarDate'
import { useLangStore } from '@/stores/uiLang'
import CalendarCell from '@/components/calendar/CalendarCell.vue'

const props = withDefaults(defineProps<{
  year: number
  month: number
  showWeekdays?: boolean
  minDateExclusive?: string
  maxDateExclusive?: string
}>(), {
  showWeekdays: true,
})
const { t } = useLangStore()

const cells = computed(() => {
  const rows: Date[][] = []
  const grid = buildMonthGrid(props.year, props.month)
  for (let i = 0; i < grid.length; i += 7) {
    rows.push(grid.slice(i, i + 7))
  }
  return rows
    .filter((row) => {
      const first = row[0]
      const last = row[row.length - 1]
      if (!first || !last) return false
      if (props.minDateExclusive && formatLocalDate(last) <= props.minDateExclusive) {
        return false
      }
      if (props.maxDateExclusive && formatLocalDate(first) >= props.maxDateExclusive) {
        return false
      }
      return true
    })
    .flat()
})

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
    <div v-if="showWeekdays" class="cal-grid__weekdays">
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
  flex: 0 0 auto;
  min-height: 0;
  overflow-anchor: none;
}

.cal-grid__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
  /* Giữ Mon–Sun cố định khi cuộn các tuần cuối tháng trong .calendar-tab__grid-scroll */
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-secondary);
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
  /* Row có chiều cao tối thiểu cố định để KHÔNG phụ thuộc số hàng của trang,
     tránh hiện tượng nhảy giật khi shiftVirtualMonth đổi current page. */
  grid-auto-rows: minmax(112px, auto);
  flex: 0 0 auto;
  min-height: 0;
  overflow-anchor: none;
}
</style>
