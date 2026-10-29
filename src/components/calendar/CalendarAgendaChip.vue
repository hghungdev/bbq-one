<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useCalendarEventsStore } from '@/stores/calendarEvents'
  import { listOverdueIncompleteEvents } from '@/services/calendarOverdueReminder.service'
  import { useLangStore } from '@/stores/uiLang'
  import { addDaysToLocalKey, formatCalendarBannerDate, todayLocalKey } from '@/utils/calendarDate'
  import {
    AGENDA_TOMORROW_PREVIEW,
    agendaChip,
    buildAgenda,
    overduePanelRows,
    previewItems,
    titlesNeedCount,
    type AgendaDay,
    type AgendaItem,
  } from '@/utils/calendarAgenda'
  import AppIcon from '@/components/ui/AppIcon.vue'

  /**
   * U6: lịch hôm nay / ngày mai gọn trong MỘT chip trên header (thay 2 banner xếp chồng). Bấm → bảng
   * chi tiết; không chạy chữ, không tự ẩn — có sự kiện thì luôn thấy, hết sự kiện thì chip biến mất.
   * U12: nhóm thứ hai "Quá hạn" (thay hộp thoại tự bật) — đứng đầu bảng, "Xem tất cả" mở hộp thoại.
   * U14: ✓ từng dòng quá hạn — xong một việc ngay trong bảng, bấm lại = hoàn tác.
   */
  const emit = defineEmits<{
    'open-calendar': [dateKey: string]
    'review-overdue': []
  }>()

  const calendar = useCalendarEventsStore()
  const langStore = useLangStore()
  const { t } = langStore
  const { lang } = storeToRefs(langStore)

  /** Làm mới mỗi lần mở bảng — popup / tab mở qua nửa đêm không kẹt ở ngày cũ. */
  const todayKey = ref(todayLocalKey())
  const tomorrowKey = computed(() => addDaysToLocalKey(todayKey.value, 1))

  const open = ref(false)
  const rootRef = ref<HTMLElement | null>(null)
  const triggerRef = ref<HTMLButtonElement | null>(null)
  const panelRef = ref<HTMLElement | null>(null)
  const panelId = 'bbqone-agenda-panel'

  /** U12: computed theo store — đánh dấu xong / tải lại / đăng nhập muộn đều tự cập nhật. */
  const overdueEvents = computed(() => listOverdueIncompleteEvents(calendar.events))
  // U10: tạm bỏ "Ẩn" ngày mai — không đọc trạng thái ẩn cũ (ai từng bấm Ẩn vẫn thấy Ngày mai).
  const agenda = computed(() =>
    buildAgenda(
      (key) => calendar.eventsForDate(key),
      todayKey.value,
      tomorrowKey.value,
      null,
      overdueEvents.value,
    ),
  )
  const chip = computed(() => agendaChip(agenda.value))

  /**
   * U14: id các dòng quá hạn chụp lúc mở bảng — đánh dấu xong thì dòng ở nguyên chỗ (gạch ngang, bấm lại
   * = hoàn tác) thay vì biến mất / nhảy dòng; đóng bảng rồi mở lại mới rút khỏi danh sách.
   */
  const overdueShownIds = ref<string[]>([])
  const overdueRows = computed(() => overduePanelRows(overdueShownIds.value, calendar.events))
  const overdueOpenCount = computed(() => agenda.value.overdue?.count ?? 0)
  /** "và n việc khác": việc chưa xong ngoài các dòng đang hiện. */
  const overdueMoreCount = computed(
    () => overdueOpenCount.value - overdueRows.value.filter((r) => !r.done).length,
  )

  /** U30: Ngày mai trong bảng — 3 dòng đầu + "Xem thêm n" (mở đủ ngay trong bảng); mở lại bảng thu về 3. */
  const tomorrowExpanded = ref(false)
  const days = computed(() => {
    const out: { tone: 'today' | 'tomorrow'; day: AgendaDay; items: AgendaItem[]; more: number }[] = []
    const { today, tomorrow } = agenda.value
    if (today) out.push({ tone: 'today', day: today, items: today.items, more: 0 })
    if (tomorrow) {
      const p = previewItems(tomorrow.items, AGENDA_TOMORROW_PREVIEW, tomorrowExpanded.value)
      out.push({ tone: 'tomorrow', day: tomorrow, items: p.shown, more: p.more })
    }
    return out
  })

  const separator = computed(() => t('calendar.agenda.listSeparator'))
  const chipLabel = computed(() => {
    if (chip.value?.tone === 'overdue') return t('calendar.agenda.overdue')
    return chip.value?.tone === 'tomorrow' ? t('calendar.agenda.tomorrow') : t('calendar.agenda.today')
  })
  const chipTitles = computed(() => {
    if (!chip.value) return ''
    if (chip.value.tone === 'overdue') return t('calendar.agenda.overdueCount', { n: chip.value.overdueCount })
    return chip.value.titles.join(separator.value)
  })

  /** Đoạn "· 5 quá hạn" cạnh chữ chính (khi chữ chính là hôm nay / ngày mai). */
  const overdueShort = computed(() =>
    chip.value && chip.value.tone !== 'overdue' && chip.value.overdueCount > 0
      ? t('calendar.agenda.overdueShort', { n: chip.value.overdueCount })
      : '',
  )

  /**
   * U30 (thay U18 "vài tên + +n"): mọi tên vừa chỗ → hiện đủ tên; không vừa hết → ghi số ("6 sự kiện"),
   * bảng liệt kê đủ. null = chưa đo → vẽ tên (lần đầu), đo xong mới đổi sang số nếu cần.
   */
  const useCount = ref<boolean | null>(null)
  const titlesRef = ref<HTMLElement | null>(null)
  const listTitles = computed(() => (chip.value && chip.value.tone !== 'overdue' ? chip.value.titles : []))
  const shownTitles = computed(() => {
    if (chip.value?.tone === 'overdue') return chipTitles.value
    return useCount.value
      ? t('calendar.agenda.eventCount', { n: listTitles.value.length })
      : listTitles.value.join(separator.value)
  })

  let measureCtx: CanvasRenderingContext2D | null = null
  function textWidth(text: string, el: Element): number {
    measureCtx ??= document.createElement('canvas').getContext('2d')
    if (!measureCtx) return 0
    const cs = getComputedStyle(el)
    measureCtx.font = cs.font
    if ('letterSpacing' in measureCtx) measureCtx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing
    return measureCtx.measureText(text).width
  }

  /** Chỗ trống thật = bề rộng vùng giữa header − phần cố định của chip (chấm, nhãn, "Mai 3", ⌄, lề). */
  function measureTitles(): void {
    const c = chip.value
    const titlesEl = titlesRef.value
    const trigger = triggerRef.value
    const mid = rootRef.value?.parentElement
    if (!c || c.tone === 'overdue' || !titlesEl || !trigger || !mid) return
    const fixed = trigger.getBoundingClientRect().width - titlesEl.getBoundingClientRect().width
    const available = mid.clientWidth - fixed - 2
    const widths = c.titles.map((title) => Math.ceil(textWidth(title, titlesEl)))
    const sep = textWidth(separator.value, titlesEl)
    useCount.value = titlesNeedCount(widths, available, sep)
  }

  function scheduleMeasure(): void {
    void nextTick(measureTitles)
  }

  let midObserver: ResizeObserver | null = null
  watch(
    rootRef,
    (el) => {
      midObserver?.disconnect()
      midObserver = null
      const mid = el?.parentElement
      if (!mid || typeof ResizeObserver === 'undefined') return
      midObserver = new ResizeObserver(scheduleMeasure)
      midObserver.observe(mid)
    },
    { flush: 'post' },
  )
  watch(
    () => [listTitles.value.join('\u0000'), separator.value, chipLabel.value, overdueShort.value, chip.value?.tomorrowCount],
    () => {
      useCount.value = null
      scheduleMeasure()
    },
    { flush: 'post' },
  )
  void document.fonts?.ready.then(scheduleMeasure)

  /** Ngày ngắn cho dòng quá hạn: 20/10 · Oct 20. */
  function shortDate(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return lang.value === 'vi'
      ? dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
      : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function dayLabel(tone: 'today' | 'tomorrow'): string {
    return tone === 'today' ? t('calendar.agenda.today') : t('calendar.agenda.tomorrow')
  }

  function dateLabel(dateKey: string): string {
    return formatCalendarBannerDate(dateKey, lang.value)
  }

  async function openPanel(): Promise<void> {
    todayKey.value = todayLocalKey()
    tomorrowExpanded.value = false
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
    overdueShownIds.value = isOpen ? (agenda.value.overdue?.items.map((i) => i.id) ?? []) : []
  })

  // Hết sự kiện (vd vừa ẩn ngày mai, không có hôm nay) → chip biến mất → bỏ trạng thái mở.
  watch(chip, (c) => {
    if (!c) open.value = false
  })

  onBeforeUnmount(() => {
    midObserver?.disconnect()
    document.removeEventListener('pointerdown', onDocPointerDown, true)
  })

  function openDay(dateKey: string): void {
    closePanel(false)
    emit('open-calendar', dateKey)
  }

  /** Lưu ngay (không hẹn giờ) — đóng popup lúc nào cũng an toàn. */
  async function toggleOverdueDone(item: AgendaItem): Promise<void> {
    try {
      if (item.done) await calendar.toggleDone(item.id)
      else await calendar.markEventsDone([item.id])
    } catch (e) {
      console.error(e)
    }
  }

  /** Nút "Xem thêm" biến mất sau khi bấm → giữ focus trong bảng (Esc / Tab vẫn chạy). */
  function expandTomorrow(): void {
    tomorrowExpanded.value = true
    void nextTick(() => panelRef.value?.focus({ preventScroll: true }))
  }

  function reviewOverdue(): void {
    closePanel(false)
    emit('review-overdue')
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
      :aria-label="
        t('calendar.agenda.chipAria', {
          label: chipLabel,
          list: overdueShort ? `${chipTitles} · ${overdueShort}` : chipTitles,
        })
      "
      :title="overdueShort ? `${chipLabel}: ${chipTitles} · ${overdueShort}` : `${chipLabel}: ${chipTitles}`"
      @click="toggle"
    >
      <span class="agenda-chip__dot" :class="`agenda-chip__dot--${chip.tone}`" aria-hidden="true" />
      <span class="agenda-chip__label">{{ chipLabel }}</span>
      <span ref="titlesRef" class="agenda-chip__titles">{{ shownTitles }}</span>
      <span v-if="overdueShort" class="agenda-chip__more agenda-chip__more--overdue">
        <span class="agenda-chip__dot agenda-chip__dot--overdue" aria-hidden="true" />
        {{ overdueShort }}
      </span>
      <!-- Chip không dài thêm: tối đa MỘT đoạn phụ — quá hạn (gấp hơn) thay cho "Mai n". -->
      <span v-else-if="chip.tomorrowCount > 0" class="agenda-chip__more">
        <span class="agenda-chip__dot agenda-chip__dot--tomorrow" aria-hidden="true" />
        {{ t('calendar.agenda.tomorrowCount', { n: chip.tomorrowCount }) }}
      </span>
      <AppIcon name="chevron-down" :size="14" class="agenda-chip__chevron" :class="{ 'agenda-chip__chevron--open': open }" />
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
      <!-- U12: nhóm "Quá hạn" đứng đầu (gấp nhất). -->
      <section v-if="overdueRows.length > 0" class="agenda-chip__day agenda-chip__day--overdue">
        <div class="agenda-chip__day-head">
          <span class="agenda-chip__dot agenda-chip__dot--overdue" aria-hidden="true" />
          <span class="agenda-chip__day-label">
            {{ t('calendar.agenda.overdue')
            }}<span class="agenda-chip__day-date">
              · {{ t('calendar.agenda.overdueCount', { n: overdueOpenCount }) }}</span
            >
          </span>
          <button
            v-if="overdueOpenCount > 0"
            type="button"
            class="agenda-chip__link agenda-chip__link--accent"
            @click="reviewOverdue"
          >
            {{ t('calendar.agenda.reviewOverdue') }}
          </button>
        </div>
        <ul class="agenda-chip__items">
          <li v-for="item in overdueRows" :key="item.id" class="agenda-chip__row">
            <button
              type="button"
              class="agenda-chip__check"
              :class="{ 'agenda-chip__check--done': item.done }"
              :aria-pressed="item.done"
              :aria-label="t('calendar.agenda.markOneDone', { title: item.title })"
              :title="
                item.done
                  ? t('calendar.agenda.markOneUndo', { title: item.title })
                  : t('calendar.agenda.markOneDone', { title: item.title })
              "
              @click="toggleOverdueDone(item)"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle class="agenda-chip__check-ring" cx="12" cy="12" r="8.25" />
                <path class="agenda-chip__check-mark" d="M8.6 12.3l2.3 2.3 4.6-5" />
              </svg>
            </button>
            <button
              type="button"
              class="agenda-chip__item"
              :class="{ 'agenda-chip__item--done': item.done }"
              @click="openDay(item.dateKey)"
            >
              <span
                class="agenda-chip__swatch"
                :style="item.color ? { background: item.color } : undefined"
                aria-hidden="true"
              />
              <span class="agenda-chip__item-title">{{ item.title }}</span>
              <span class="agenda-chip__item-date">{{ shortDate(item.dateKey) }}</span>
            </button>
          </li>
          <li v-if="overdueMoreCount > 0">
            <button type="button" class="agenda-chip__item agenda-chip__item--more" @click="reviewOverdue">
              {{ t('calendar.agenda.overdueMore', { n: overdueMoreCount }) }}
            </button>
          </li>
        </ul>
      </section>
      <section v-for="d in days" :key="d.tone" class="agenda-chip__day">
        <div class="agenda-chip__day-head">
          <span class="agenda-chip__dot" :class="`agenda-chip__dot--${d.tone}`" aria-hidden="true" />
          <span class="agenda-chip__day-label">
            {{ dayLabel(d.tone) }}<span class="agenda-chip__day-date"> · {{ dateLabel(d.day.dateKey) }}</span>
          </span>
          <button
            type="button"
            class="agenda-chip__link agenda-chip__link--accent"
            @click="openDay(d.day.dateKey)"
          >
            {{ t('calendar.agenda.openDay') }}
          </button>
        </div>
        <ul class="agenda-chip__items">
          <li v-for="item in d.items" :key="item.id">
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
          <li v-if="d.more > 0">
            <button type="button" class="agenda-chip__item agenda-chip__item--more" @click="expandTomorrow">
              {{ t('calendar.agenda.showMore', { n: d.more }) }}
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

  .agenda-chip--overdue {
    --chip-bg: color-mix(in srgb, var(--danger) 10%, var(--bg-panel));
    --chip-bg-hover: color-mix(in srgb, var(--danger) 16%, var(--bg-panel));
    --chip-border: var(--danger);
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

  .agenda-chip__dot--overdue {
    background: var(--danger);
  }

  .agenda-chip__more--overdue {
    color: var(--danger);
    font-weight: 600;
  }

  .agenda-chip__item-date {
    flex: 0 0 auto;
    margin-left: auto;
    padding-left: 8px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .agenda-chip__item--more {
    padding-left: 19px;
    color: var(--text-muted);
  }

  .agenda-chip__item--more:hover {
    color: var(--accent);
  }

  .agenda-chip__label {
    flex: 0 0 auto;
    font-weight: 700;
    white-space: nowrap;
  }

  /* Ôm sát chữ (không giãn): đủ tên, hoặc số sự kiện (U30). */
  .agenda-chip__titles {
    flex: 0 1 auto;
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
    /* U30: Hôm nay đủ 6 dòng + Ngày mai 3 + Quá hạn — popup cao 600 px, dài hơn thì cuộn. */
    max-height: min(520px, calc(100vh - 72px));
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

  /* U14: ✓ từng việc quá hạn — vòng tròn rỗng; rê chuột hiện dấu ✓ mờ; xong = tròn đặc màu nhấn. */
  .agenda-chip__row {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .agenda-chip__row .agenda-chip__item {
    flex: 1 1 auto;
    min-width: 0;
  }

  .agenda-chip__check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }

  .agenda-chip__check:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .agenda-chip__check-ring {
    fill: transparent;
    stroke: var(--text-muted);
    stroke-width: 1.5;
    transition:
      fill 0.12s linear,
      stroke 0.12s linear;
  }

  .agenda-chip__check-mark {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0;
    transition: opacity 0.12s linear;
  }

  .agenda-chip__check:hover .agenda-chip__check-ring {
    stroke: var(--accent);
  }

  .agenda-chip__check:hover .agenda-chip__check-mark {
    opacity: 0.55;
  }

  .agenda-chip__check--done .agenda-chip__check-ring,
  .agenda-chip__check--done:hover .agenda-chip__check-ring {
    fill: var(--accent);
    stroke: var(--accent);
  }

  .agenda-chip__check--done .agenda-chip__check-mark,
  .agenda-chip__check--done:hover .agenda-chip__check-mark {
    stroke: var(--on-accent);
    opacity: 1;
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
    .agenda-chip__chevron,
    .agenda-chip__check-ring,
    .agenda-chip__check-mark {
      transition: none;
    }
  }
</style>
