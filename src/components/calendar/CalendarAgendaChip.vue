<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useCalendarEventsStore } from '@/stores/calendarEvents'
  import { useLangStore } from '@/stores/uiLang'
  import {
    dismissUpcomingBannerForDate,
    getDismissedUpcomingBannerDateKey,
  } from '@/services/calendarBannerDismiss.service'
  import { addDaysToLocalKey, formatCalendarBannerDate, todayLocalKey } from '@/utils/calendarDate'
  import { agendaChip, buildAgenda, type AgendaDay } from '@/utils/calendarAgenda'

  /**
   * U6: lịch hôm nay / ngày mai gọn trong MỘT chip trên header (thay 2 banner xếp chồng). Bấm → bảng
   * chi tiết; không chạy chữ, không tự ẩn — có sự kiện thì luôn thấy, hết sự kiện thì chip biến mất.
   */
  const emit = defineEmits<{
    'open-calendar': [dateKey: string]
  }>()

  const calendar = useCalendarEventsStore()
  const langStore = useLangStore()
  const { t } = langStore
  const { lang } = storeToRefs(langStore)

  const dismissLoaded = ref(false)
  const dismissedTomorrowKey = ref<string | null>(null)
  /** Làm mới mỗi lần mở bảng — popup / tab mở qua nửa đêm không kẹt ở ngày cũ. */
  const todayKey = ref(todayLocalKey())
  const tomorrowKey = computed(() => addDaysToLocalKey(todayKey.value, 1))

  const open = ref(false)
  const rootRef = ref<HTMLElement | null>(null)
  const triggerRef = ref<HTMLButtonElement | null>(null)
  const panelRef = ref<HTMLElement | null>(null)
  const panelId = 'bbqone-agenda-panel'

  const agenda = computed(() =>
    buildAgenda(
      (key) => calendar.eventsForDate(key),
      todayKey.value,
      tomorrowKey.value,
      dismissedTomorrowKey.value,
    ),
  )
  /** Chưa đọc xong trạng thái "đã ẩn ngày mai" thì chưa hiện — tránh nháy phần đã ẩn. */
  const chip = computed(() => (dismissLoaded.value ? agendaChip(agenda.value) : null))

  const days = computed(() => {
    const out: { tone: 'today' | 'tomorrow'; day: AgendaDay }[] = []
    if (agenda.value.today) out.push({ tone: 'today', day: agenda.value.today })
    if (agenda.value.tomorrow) out.push({ tone: 'tomorrow', day: agenda.value.tomorrow })
    return out
  })

  const separator = computed(() => t('calendar.agenda.listSeparator'))
  const chipLabel = computed(() =>
    chip.value?.tone === 'tomorrow' ? t('calendar.agenda.tomorrow') : t('calendar.agenda.today'),
  )
  const chipTitles = computed(() => chip.value?.titles.join(separator.value) ?? '')

  function dayLabel(tone: 'today' | 'tomorrow'): string {
    return tone === 'today' ? t('calendar.agenda.today') : t('calendar.agenda.tomorrow')
  }

  function dateLabel(dateKey: string): string {
    return formatCalendarBannerDate(dateKey, lang.value)
  }

  onMounted(async () => {
    dismissedTomorrowKey.value = await getDismissedUpcomingBannerDateKey()
    dismissLoaded.value = true
  })

  async function openPanel(): Promise<void> {
    todayKey.value = todayLocalKey()
    open.value = true
    await nextTick()
    panelRef.value?.focus()
  }

  function closePanel(returnFocus: boolean): void {
    if (!open.value) return
    open.value = false
    if (returnFocus) void nextTick(() => triggerRef.value?.focus())
  }

  function toggle(): void {
    if (open.value) closePanel(false)
    else void openPanel()
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !open.value) return
    e.preventDefault()
    e.stopPropagation()
    closePanel(true)
  }

  /** Bấm ra ngoài → đóng (không kéo focus về chip — user đang bấm chỗ khác). */
  function onDocPointerDown(e: PointerEvent): void {
    if (rootRef.value && !rootRef.value.contains(e.target as Node)) closePanel(false)
  }

  /** Tab ra khỏi bảng → đóng, để bảng không treo lơ lửng khi dùng bàn phím. */
  function onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null
    if (next && rootRef.value && !rootRef.value.contains(next)) closePanel(false)
  }

  watch(open, (isOpen) => {
    if (isOpen) document.addEventListener('pointerdown', onDocPointerDown, true)
    else document.removeEventListener('pointerdown', onDocPointerDown, true)
  })

  // Hết sự kiện (vd vừa ẩn ngày mai, không có hôm nay) → chip biến mất → bỏ trạng thái mở.
  watch(chip, (c) => {
    if (!c) open.value = false
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
  })

  function openDay(dateKey: string): void {
    closePanel(false)
    emit('open-calendar', dateKey)
  }

  async function onDismissTomorrow(): Promise<void> {
    const key = tomorrowKey.value
    dismissedTomorrowKey.value = key
    // Nút vừa bấm biến mất → giữ focus trong bảng (nếu bảng còn).
    await nextTick()
    panelRef.value?.focus()
    await dismissUpcomingBannerForDate(key)
  }
</script>

<template>
  <div
    v-if="chip"
    ref="rootRef"
    class="agenda-chip"
    :class="`agenda-chip--${chip.tone}`"
    @keydown="onKeydown"
    @focusout="onFocusOut"
  >
    <button
      ref="triggerRef"
      type="button"
      class="agenda-chip__trigger"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="panelId"
      :aria-label="t('calendar.agenda.chipAria', { label: chipLabel, list: chipTitles })"
      :title="`${chipLabel}: ${chipTitles}`"
      @click="toggle"
    >
      <span class="agenda-chip__dot" :class="`agenda-chip__dot--${chip.tone}`" aria-hidden="true" />
      <span class="agenda-chip__label">{{ chipLabel }}</span>
      <span class="agenda-chip__titles">{{ chipTitles }}</span>
      <span v-if="chip.tomorrowCount > 0" class="agenda-chip__more">
        <span class="agenda-chip__dot agenda-chip__dot--tomorrow" aria-hidden="true" />
        {{ t('calendar.agenda.tomorrowCount', { n: chip.tomorrowCount }) }}
      </span>
      <svg
        class="agenda-chip__chevron"
        :class="{ 'agenda-chip__chevron--open': open }"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        aria-hidden="true"
      >
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M6 9l6 6 6-6"
        />
      </svg>
    </button>

    <div
      v-if="open"
      :id="panelId"
      ref="panelRef"
      class="agenda-chip__panel"
      role="dialog"
      :aria-label="t('calendar.agenda.panelTitle')"
      tabindex="-1"
    >
      <p class="agenda-chip__panel-title">{{ t('calendar.agenda.panelTitle') }}</p>
      <section v-for="d in days" :key="d.tone" class="agenda-chip__day">
        <div class="agenda-chip__day-head">
          <span class="agenda-chip__dot" :class="`agenda-chip__dot--${d.tone}`" aria-hidden="true" />
          <span class="agenda-chip__day-label">
            {{ dayLabel(d.tone) }}<span class="agenda-chip__day-date"> · {{ dateLabel(d.day.dateKey) }}</span>
          </span>
          <button
            v-if="d.tone === 'tomorrow'"
            type="button"
            class="agenda-chip__link"
            :title="t('calendar.agenda.dismissTomorrowHint')"
            @click="onDismissTomorrow"
          >
            {{ t('calendar.agenda.dismissTomorrow') }}
          </button>
          <button
            type="button"
            class="agenda-chip__link agenda-chip__link--accent"
            @click="openDay(d.day.dateKey)"
          >
            {{ t('calendar.agenda.openDay') }}
          </button>
        </div>
        <ul class="agenda-chip__items">
          <li v-for="item in d.day.items" :key="item.id">
            <button
              type="button"
              class="agenda-chip__item"
              :class="{ 'agenda-chip__item--done': item.done }"
              @click="openDay(d.day.dateKey)"
            >
              <span
                class="agenda-chip__swatch"
                :style="item.color ? { background: item.color } : undefined"
                aria-hidden="true"
              />
              <span v-if="item.time" class="agenda-chip__time">{{ item.time }}</span>
              <span class="agenda-chip__item-title">{{ item.title }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
  .agenda-chip {
    position: relative;
    display: flex;
    min-width: 0;
    max-width: 100%;
  }

  .agenda-chip__trigger {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    max-width: 100%;
    height: 34px;
    margin: 0;
    padding: 0 10px 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--chip-bg);
    color: var(--text-primary);
    font: inherit;
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
    transition:
      background 0.12s linear,
      border-color 0.12s linear;
  }

  .agenda-chip--today {
    --chip-bg: var(--calendar-banner-today-bg);
    --chip-bg-hover: var(--calendar-banner-today-bg-hover);
    --chip-border: var(--calendar-banner-today-border);
  }

  .agenda-chip--tomorrow {
    --chip-bg: var(--calendar-banner-upcoming-bg);
    --chip-bg-hover: var(--calendar-banner-upcoming-bg-hover);
    --chip-border: var(--calendar-banner-upcoming-border);
  }

  .agenda-chip__trigger:hover,
  .agenda-chip__trigger[aria-expanded='true'] {
    background: var(--chip-bg-hover);
    border-color: color-mix(in srgb, var(--chip-border) 55%, var(--border));
  }

  .agenda-chip__trigger:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .agenda-chip__dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .agenda-chip__dot--today {
    background: var(--calendar-banner-today-border);
  }

  .agenda-chip__dot--tomorrow {
    background: var(--calendar-banner-upcoming-border);
  }

  .agenda-chip__label {
    flex: 0 0 auto;
    font-weight: 700;
    white-space: nowrap;
  }

  .agenda-chip__titles {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
  }

  .agenda-chip__more {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
    padding-left: 7px;
    border-left: 1px solid var(--border);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .agenda-chip__chevron {
    flex: 0 0 auto;
    color: var(--text-muted);
    transition: transform 0.15s ease;
  }

  .agenda-chip__chevron--open {
    transform: rotate(180deg);
  }

  /* Bảng chi tiết: neo mép phải chip (chip nằm sát nhóm icon bên phải header). */
  .agenda-chip__panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 10002;
    width: 360px;
    max-height: 380px;
    overflow-y: auto;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-panel);
    box-shadow: 0 12px 32px var(--panel-ring);
  }

  .agenda-chip__panel:focus {
    outline: none;
  }

  .agenda-chip__panel-title {
    margin: 0 4px 8px;
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-primary);
  }

  .agenda-chip__day + .agenda-chip__day {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .agenda-chip__day-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px 4px;
  }

  .agenda-chip__day-label {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .agenda-chip__day-date {
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-muted);
  }

  .agenda-chip__link {
    flex: 0 0 auto;
    margin: 0;
    padding: 2px 6px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .agenda-chip__link:hover {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--text-primary) 6%, transparent);
  }

  .agenda-chip__link--accent {
    color: var(--accent);
    font-weight: 600;
  }

  .agenda-chip__link:focus-visible,
  .agenda-chip__item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .agenda-chip__items {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .agenda-chip__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin: 0;
    padding: 6px 8px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
  }

  .agenda-chip__item:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .agenda-chip__swatch {
    flex: 0 0 auto;
    width: 3px;
    height: 16px;
    border-radius: 2px;
    background: var(--border);
  }

  .agenda-chip__time {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .agenda-chip__item-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agenda-chip__item--done .agenda-chip__item-title {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  @media (prefers-reduced-motion: reduce) {
    .agenda-chip__chevron {
      transition: none;
    }
  }
</style>
