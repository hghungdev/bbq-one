<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useLangStore } from '@/stores/uiLang'
import {
  dismissUpcomingBannerForDate,
  getDismissedUpcomingBannerDateKey,
} from '@/services/calendarBannerDismiss.service'
import {
  addDaysToLocalKey,
  formatCalendarBannerDate,
  todayLocalKey,
} from '@/utils/calendarDate'

const emit = defineEmits<{
  'open-calendar': []
}>()

const calendar = useCalendarEventsStore()
const langStore = useLangStore()
const { t } = langStore
const { lang } = storeToRefs(langStore)

const dismissLoaded = ref(false)
const dismissedUpcomingDateKey = ref<string | null>(null)

const todayKey = computed(() => todayLocalKey())
const tomorrowKey = computed(() => addDaysToLocalKey(todayKey.value, 1))

function sortedTitlesForDate(dateKey: string): string[] {
  const list = calendar.eventsForDate(dateKey)
  return list
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => e.title.trim())
    .filter(Boolean)
}

function joinTitles(titles: string[]): string {
  return titles.join(t('calendar.banner.listSeparator'))
}

function bannerDateLabel(dateKey: string): string {
  return formatCalendarBannerDate(dateKey, lang.value)
}

const upcomingTitles = computed(() => sortedTitlesForDate(tomorrowKey.value))
const todayTitles = computed(() => sortedTitlesForDate(todayKey.value))

const showUpcomingBanner = computed(() => {
  if (!dismissLoaded.value) return false
  if (upcomingTitles.value.length === 0) return false
  return dismissedUpcomingDateKey.value !== tomorrowKey.value
})

const upcomingLineText = computed(() => {
  const date = bannerDateLabel(tomorrowKey.value)
  return t('calendar.banner.upcomingLine', {
    date,
    list: joinTitles(upcomingTitles.value),
  })
})

const upcomingAriaLabel = computed(() =>
  t('calendar.banner.ariaOpenCalendarUpcoming', {
    date: bannerDateLabel(tomorrowKey.value),
  }),
)

const todayLineText = computed(() => {
  const date = bannerDateLabel(todayKey.value)
  return t('calendar.banner.todayLine', {
    date,
    list: joinTitles(todayTitles.value),
  })
})

const todayAriaLabel = computed(() =>
  t('calendar.banner.ariaOpenCalendarToday', {
    date: bannerDateLabel(todayKey.value),
  }),
)

const showTodayBanner = computed(
  () => dismissLoaded.value && todayTitles.value.length > 0,
)

const visible = computed(() => showUpcomingBanner.value || showTodayBanner.value)

onMounted(async () => {
  dismissedUpcomingDateKey.value = await getDismissedUpcomingBannerDateKey()
  dismissLoaded.value = true
})

function onActivate(): void {
  emit('open-calendar')
}

async function onDismissUpcoming(e: MouseEvent): Promise<void> {
  e.stopPropagation()
  const key = tomorrowKey.value
  dismissedUpcomingDateKey.value = key
  await dismissUpcomingBannerForDate(key)
}
</script>

<template>
  <div v-if="visible" class="calendar-today-banner-stack">
    <div
      v-if="showUpcomingBanner"
      class="calendar-today-banner calendar-today-banner--upcoming"
      :class="{ 'calendar-today-banner--not-first': false }"
    >
      <button
        type="button"
        class="calendar-today-banner__main"
        :aria-label="upcomingAriaLabel"
        @click="onActivate"
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
        <span class="calendar-today-banner__text">{{ upcomingLineText }}</span>
      </button>
      <button
        type="button"
        class="calendar-today-banner__close"
        :aria-label="t('calendar.banner.dismissUpcoming')"
        :title="t('calendar.banner.dismissUpcoming')"
        @click="onDismissUpcoming"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            d="M6 6l12 12M18 6L6 18"
          />
        </svg>
      </button>
    </div>

    <div
      v-if="showTodayBanner"
      class="calendar-today-banner calendar-today-banner--today"
      :class="{ 'calendar-today-banner--not-first': showUpcomingBanner }"
      role="button"
      tabindex="0"
      :aria-label="todayAriaLabel"
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
      <span class="calendar-today-banner__text">{{ todayLineText }}</span>
    </div>
  </div>
</template>

<style scoped>
.calendar-today-banner-stack {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  border-top: 1px solid var(--border);
}

.calendar-today-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 8px 12px;
  flex: 0 0 auto;
  text-align: left;
  color: var(--text-primary);
}

.calendar-today-banner--today {
  cursor: pointer;
  gap: 10px;
  padding-right: 12px;
}

.calendar-today-banner--not-first {
  border-top: 1px solid var(--border);
}

.calendar-today-banner--upcoming {
  background: var(--calendar-banner-upcoming-bg);
  border-left: 3px solid var(--calendar-banner-upcoming-border);
}

.calendar-today-banner--upcoming:hover .calendar-today-banner__main {
  color: var(--text-primary);
}

.calendar-today-banner--upcoming .calendar-today-banner__speaker {
  color: var(--calendar-banner-upcoming-icon);
}

.calendar-today-banner--today {
  background: var(--calendar-banner-today-bg);
  border-left: 3px solid var(--calendar-banner-today-border);
  color: var(--calendar-banner-today-text);
}

.calendar-today-banner--today:hover {
  background: var(--calendar-banner-today-bg-hover);
}

.calendar-today-banner--today .calendar-today-banner__speaker {
  color: var(--calendar-banner-today-icon);
}

.calendar-today-banner--today:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.calendar-today-banner__main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.calendar-today-banner__main:hover {
  color: var(--accent);
}

.calendar-today-banner__main:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.calendar-today-banner__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    color 0.12s linear,
    border-color 0.12s linear,
    background 0.12s linear;
}

.calendar-today-banner__close:hover {
  color: var(--text-primary);
  border-color: var(--border);
  background: var(--bg-panel);
}

.calendar-today-banner__close:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.calendar-today-banner__speaker {
  flex: 0 0 auto;
  display: block;
  color: var(--calendar-banner-upcoming-icon, var(--accent));
}

.calendar-today-banner__text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--font-size-sm);
  line-height: 1.45;
}
</style>
