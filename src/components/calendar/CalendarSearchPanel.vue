<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useLangStore } from '@/stores/uiLang'
import type { CalendarEvent } from '@/types/calendar'
import { normalizeLocalDateKey } from '@/utils/calendarDate'

const emit = defineEmits<{
  pick: [event: CalendarEvent]
}>()

const store = useCalendarEventsStore()
const langStore = useLangStore()
const { lang } = storeToRefs(langStore)
const { t } = langStore

const visible = computed(() => store.searchQuery.trim().length > 0)
const matches = computed(() => store.calendarSearchMatches)

function formatDateLabel(dateKey: string): string {
  const key = normalizeLocalDateKey(dateKey)
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const locale = lang.value === 'vi' ? 'vi-VN' : 'en-US'
  return dt.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function onRowClick(ev: CalendarEvent, e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  emit('pick', ev)
}
</script>

<template>
  <div v-if="visible" class="cal-search-panel" role="region" :aria-label="t('calendar.search.region')">
    <p class="cal-search-panel__title">
      {{ t('calendar.search.resultsTitle', { n: matches.length }) }}
    </p>
    <p v-if="matches.length === 0" class="cal-search-panel__empty">{{ t('calendar.search.empty') }}</p>
    <p v-else class="cal-search-panel__hint">{{ t('calendar.search.hint') }}</p>
    <ul v-if="matches.length > 0" class="cal-search-panel__list">
      <li v-for="ev in matches" :key="ev.id">
        <button type="button" class="cal-search-panel__row" @click="onRowClick(ev, $event)">
          <span class="cal-search-panel__date">{{ formatDateLabel(ev.event_date) }}</span>
          <span class="cal-search-panel__event-title">{{ ev.title }}</span>
          <span v-if="ev.is_done" class="cal-search-panel__done">{{ t('calendar.search.doneTag') }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cal-search-panel {
  flex: 0 0 auto;
  max-height: 180px;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}

.cal-search-panel__title {
  margin: 0;
  padding: 6px 10px 4px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.cal-search-panel__hint {
  margin: 0;
  padding: 0 10px 6px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  line-height: 1.35;
}

.cal-search-panel__empty {
  margin: 0;
  padding: 8px 10px 10px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.cal-search-panel__list {
  list-style: none;
  margin: 0;
  padding: 0 6px 8px;
  overflow-y: auto;
  min-height: 0;
}

.cal-search-panel__row {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  text-align: left;
  padding: 6px 8px;
  margin-bottom: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  cursor: pointer;
}

.cal-search-panel__row:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.cal-search-panel__date {
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.cal-search-panel__row:hover .cal-search-panel__date {
  color: inherit;
}

.cal-search-panel__event-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--font-size-sm);
  text-align: left;
}

.cal-search-panel__done {
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  text-decoration: line-through;
  opacity: 0.7;
}
</style>
