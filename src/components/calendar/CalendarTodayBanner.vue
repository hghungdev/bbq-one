<script setup lang="ts">
import { computed } from 'vue'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useLangStore } from '@/stores/uiLang'
import { todayLocalKey } from '@/utils/calendarDate'

const emit = defineEmits<{
  'open-calendar': []
}>()

const calendar = useCalendarEventsStore()
const { t } = useLangStore()

const todayKey = computed(() => todayLocalKey())

const todayEvents = computed(() => {
  const list = calendar.eventsForDate(todayKey.value)
  return list.slice().sort((a, b) => a.position - b.position)
})

const bannerText = computed(() => {
  if (todayEvents.value.length === 0) return ''
  const titles = todayEvents.value.map((e) => e.title.trim()).filter(Boolean)
  const list = titles.join(t('calendar.banner.todaySeparator'))
  return t('calendar.banner.todayLine', { list })
})

const visible = computed(() => todayEvents.value.length > 0)

function onActivate(): void {
  emit('open-calendar')
}
</script>

<template>
  <div
    v-if="visible"
    class="calendar-today-banner"
    role="button"
    tabindex="0"
    :aria-label="t('calendar.banner.ariaOpenCalendar')"
    @click="onActivate"
    @keydown.enter.prevent="onActivate"
    @keydown.space.prevent="onActivate"
  >
    <svg
      class="calendar-today-banner__speaker"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M3 9v6h4l5 4V5L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
      />
    </svg>
    <span class="calendar-today-banner__text">{{ bannerText }}</span>
  </div>
</template>

<style scoped>
.calendar-today-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  flex: 0 0 auto;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
}

.calendar-today-banner:hover {
  background: var(--bg-secondary);
}

.calendar-today-banner:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.calendar-today-banner__speaker {
  flex: 0 0 auto;
  display: block;
  color: var(--accent);
}

.calendar-today-banner__text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--font-size-sm);
  line-height: 1.45;
}
</style>
