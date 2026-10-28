<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, useId } from 'vue'
import { storeToRefs } from 'pinia'
import { CALENDAR_MAX_EVENTS_PER_DAY, CALENDAR_TITLE_MAX } from '@/constants/calendar'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useLangStore } from '@/stores/uiLang'
import AppIcon from '@/components/ui/AppIcon.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import type { CalendarEvent } from '@/types/calendar'
import type { I18nKey } from '@/i18n/en'
import { isPastLocalDay, parseLocalDate } from '@/utils/calendarDate'
import { calendarEventToneClass } from '@/utils/calendarEventTone'
import {
  RECURRENCE_DEFAULT_COUNT,
  RECURRENCE_MAX_COUNT,
  compactDateList,
  recurrenceDates,
  type RecurrenceFreq,
} from '@/utils/calendarRecurrence'

const store = useCalendarEventsStore()
const langStore = useLangStore()
const { t } = langStore
const { lang } = storeToRefs(langStore)

const headingId = useId()
const isCreating = ref(false)
const formTitle = ref('')
const validationError = ref<string | null>(null)
const busy = ref(false)
const confirmOpen = ref(false)
const pendingDeleteId = ref<string | null>(null)
const titleInputRef = ref<InstanceType<typeof RetroInput> | null>(null)
const repeatGroupRef = ref<HTMLElement | null>(null)

/** U3: lặp lại — chỉ khi tạo mới. Mỗi lần lặp là một sự kiện riêng. U13: chọn bằng segmented control. */
const REPEAT_OPTIONS: RecurrenceFreq[] = ['none', 'weekly', 'monthly', 'yearly']
const REPEAT_LABEL: Record<RecurrenceFreq, I18nKey> = {
  none: 'calendar.repeat.none',
  weekly: 'calendar.repeat.weekly',
  monthly: 'calendar.repeat.monthly',
  yearly: 'calendar.repeat.yearly',
}
const repeatFreq = ref<RecurrenceFreq>('none')
const repeatCount = ref(RECURRENCE_DEFAULT_COUNT.weekly)
/** Báo sau khi lưu (vd ngày bị bỏ qua vì đã đủ) — sống qua cancelForm. */
const resultInfo = ref<string | null>(null)

const activeDateKey = computed(() => store.activeDate ?? '')

const isPastActiveDate = computed(() => {
  const k = activeDateKey.value
  return k.length >= 10 && isPastLocalDay(k)
})

const dayEvents = computed(() => {
  const k = activeDateKey.value
  if (!k) return []
  return store.eventsForDate(k).slice().sort((a, b) => a.position - b.position)
})

const dayIsFull = computed(() => dayEvents.value.length >= CALENDAR_MAX_EVENTS_PER_DAY)

const showForm = computed(() => isCreating.value || store.activeEventId !== null)

const repeatMax = computed(() =>
  repeatFreq.value === 'none' ? 1 : RECURRENCE_MAX_COUNT[repeatFreq.value],
)

const repeatDates = computed(() => {
  if (repeatFreq.value === 'none' || !activeDateKey.value) return []
  return recurrenceDates(activeDateKey.value, repeatFreq.value, repeatCount.value)
})

const repeatFullDays = computed(() =>
  repeatDates.value.filter((k) => store.eventsForDate(k).length >= CALENDAR_MAX_EVENTS_PER_DAY),
)
const fullDaySet = computed(() => new Set(repeatFullDays.value))

/** U13: xem trước = chip ngày (dài → "+n" + ngày cuối), thay câu dài bị cắt. */
const previewCompact = computed(() => compactDateList(repeatDates.value))

/** Số sự kiện thật sự tạo (ngày đã đủ bị bỏ qua) — hiện trên nút chính. */
const createCount = computed(() => repeatDates.value.length - repeatFullDays.value.length)

const repeatUntil = computed(() => {
  const dates = repeatDates.value
  if (dates.length === 0) return ''
  return parseLocalDate(dates[dates.length - 1]).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
})

function locale(): string {
  return lang.value === 'vi' ? 'vi-VN' : 'en-US'
}

/** "Thứ Ba, 3 tháng 11, 2026" — tiêu đề danh sách ngày + dòng phụ của form. */
function longDate(key: string): string {
  if (!key) return ''
  return parseLocalDate(key).toLocaleDateString(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Ngày ngắn cho xem trước — chỉ ghi năm khi khác năm của ngày bắt đầu. */
function shortDate(key: string): string {
  const d = parseLocalDate(key)
  const withYear = d.getFullYear() !== parseLocalDate(activeDateKey.value).getFullYear()
  return lang.value === 'vi'
    ? d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        ...(withYear ? { year: 'numeric' as const } : {}),
      })
    : d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(withYear ? { year: 'numeric' as const } : {}),
      })
}

watch(repeatFreq, (f) => {
  if (f !== 'none') repeatCount.value = RECURRENCE_DEFAULT_COUNT[f]
})

function clampRepeatCount(value: number): number {
  const n = Math.floor(Number(value))
  return Math.min(Math.max(Number.isFinite(n) ? n : 2, 2), repeatMax.value)
}

function onRepeatCountChange(): void {
  repeatCount.value = clampRepeatCount(repeatCount.value)
}

function stepRepeat(delta: number): void {
  repeatCount.value = clampRepeatCount(repeatCount.value + delta)
}

/** Radiogroup: ← → / ↑ ↓ / Home / End đổi tần suất và dời focus theo (roving tabindex). */
function onRepeatKeydown(e: KeyboardEvent): void {
  const n = REPEAT_OPTIONS.length
  const i = REPEAT_OPTIONS.indexOf(repeatFreq.value)
  let next: number
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = n - 1
  else return
  e.preventDefault()
  repeatFreq.value = REPEAT_OPTIONS[next]
  void nextTick(() => {
    repeatGroupRef.value?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  })
}

const modalHeading = computed(() => {
  if (showForm.value) {
    return store.activeEventId
      ? t('calendar.modal.title.edit')
      : t('calendar.modal.title.create')
  }
  return longDate(activeDateKey.value)
})

/** Mở form (tạo / sửa) → gõ tiêu đề ngay, không phải bấm vào ô. */
function focusTitleSoon(): void {
  void nextTick(() => titleInputRef.value?.focus())
}

watch(showForm, (open) => {
  if (open) focusTitleSoon()
})

watch(
  () => store.activeEventId,
  (id) => {
    validationError.value = null
    if (!id) {
      formTitle.value = ''
      return
    }
    const ev = store.events.find((e) => e.id === id)
    if (ev) {
      formTitle.value = ev.title
    }
  },
  { immediate: true },
)

watch(
  () => store.activeDate,
  () => {
    validationError.value = null
    resultInfo.value = null
    isCreating.value = false
  },
)

function onBackdropClick(): void {
  store.closeModal()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    store.closeModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (showForm.value) focusTitleSoon()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

function startCreate(): void {
  if (!store.activeDate || isPastActiveDate.value || dayIsFull.value) return
  store.openModalForDate(store.activeDate)
  isCreating.value = true
  formTitle.value = ''
  validationError.value = null
  resultInfo.value = null
  repeatFreq.value = 'none'
}

function startEdit(ev: CalendarEvent): void {
  store.openModalForEdit(ev.id)
  isCreating.value = false
  validationError.value = null
  resultInfo.value = null
}

function cancelForm(): void {
  isCreating.value = false
  if (store.activeDate) store.openModalForDate(store.activeDate)
  validationError.value = null
}

function validate(): string | null {
  const title = formTitle.value.trim()
  if (!title) return t('calendar.validation.titleRequired')
  if (title.length > CALENDAR_TITLE_MAX) return t('calendar.validation.titleTooLong')
  return null
}

async function onToggleDone(id: string, e: Event): Promise<void> {
  e.stopPropagation()
  const ev = store.events.find((x) => x.id === id)
  if (!ev) return
  try {
    await store.toggleDone(id)
  } catch (err) {
    console.error(err)
  }
}

function requestDelete(id: string, e: Event): void {
  e.stopPropagation()
  pendingDeleteId.value = id
  confirmOpen.value = true
}

async function confirmDelete(): Promise<void> {
  const id = pendingDeleteId.value
  pendingDeleteId.value = null
  if (!id) return
  try {
    await store.deleteEvent(id)
    if (store.activeEventId === id && store.activeDate) store.openModalForDate(store.activeDate)
    isCreating.value = false
  } catch (e) {
    console.error(e)
  }
}

function requestDeleteActive(e: Event): void {
  if (store.activeEventId) requestDelete(store.activeEventId, e)
}

function onCancelDelete(): void {
  pendingDeleteId.value = null
}

async function saveForm(): Promise<void> {
  const err = validate()
  if (err) {
    validationError.value = err
    return
  }
  validationError.value = null
  busy.value = true
  try {
    const title = formTitle.value.trim()
    if (isCreating.value) {
      if (isPastActiveDate.value || dayIsFull.value) return
      if (repeatFreq.value === 'none') {
        await store.createEvent({
          event_date: activeDateKey.value,
          title,
          description: '',
        })
      } else {
        const { skipped } = await store.createRecurringEvents(
          { event_date: activeDateKey.value, title, description: '' },
          { freq: repeatFreq.value, count: repeatCount.value },
        )
        if (skipped.length > 0) {
          resultInfo.value = t('calendar.repeat.resultSkipped', {
            dates: skipped.map(shortDate).join(', '),
            max: CALENDAR_MAX_EVENTS_PER_DAY,
          })
        }
      }
      cancelForm()
    } else if (store.activeEventId) {
      await store.updateEvent(store.activeEventId, { title })
      cancelForm()
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'MAX_EVENTS_PER_DAY') {
      validationError.value = t('calendar.validation.maxEventsPerDay', {
        max: CALENDAR_MAX_EVENTS_PER_DAY,
      })
    } else {
      console.error(e)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="cal-modal__backdrop bbqone-overlay"
      role="presentation"
      @click.self="onBackdropClick"
    >
      <div
        class="cal-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="headingId"
        @click.stop
      >
        <!-- U13 (ADN popover): một tấm phẳng — tiêu đề đậm + dòng ngày phụ, ✕ trong suốt. -->
        <header class="cal-modal__header">
          <div class="cal-modal__heading">
            <h2 :id="headingId" class="cal-modal__title">{{ modalHeading }}</h2>
            <p v-if="showForm && activeDateKey" class="cal-modal__subtitle">{{ longDate(activeDateKey) }}</p>
          </div>
          <button
            type="button"
            class="ds-icon-action"
            :aria-label="t('common.close')"
            :title="t('common.close')"
            @click="store.closeModal"
          >
            <AppIcon name="close" :size="18" />
          </button>
        </header>

        <div v-if="!showForm" class="cal-modal__body">
          <SectionHeader
            :label="t('calendar.modal.section.events')"
            :meta="`${dayEvents.length}/${CALENDAR_MAX_EVENTS_PER_DAY}`"
          >
            <!-- U15: ＋ icon như đầu mục Thư mục / Ghi chú / Section. -->
            <button
              v-if="!isPastActiveDate && !dayIsFull"
              type="button"
              class="ds-icon-action ds-icon-action--accent"
              :aria-label="t('calendar.modal.aria.add')"
              :title="t('calendar.modal.aria.add')"
              :disabled="busy"
              @click="startCreate"
            >
              <AppIcon name="plus" :size="17" />
            </button>
          </SectionHeader>
          <p v-if="resultInfo" class="cal-modal__hint" role="status">{{ resultInfo }}</p>
          <p v-if="isPastActiveDate" class="cal-modal__hint">{{ t('calendar.modal.pastDayNoAdd') }}</p>
          <p v-else-if="dayIsFull" class="cal-modal__hint">
            {{ t('calendar.modal.dayFull', { max: CALENDAR_MAX_EVENTS_PER_DAY }) }}
          </p>
          <p v-if="!dayEvents.length" class="cal-modal__empty">{{ t('calendar.modal.empty') }}</p>
          <ul v-else class="cal-modal__list">
            <li
              v-for="ev in dayEvents"
              :key="ev.id"
              class="cal-modal__row ds-row"
              :class="[calendarEventToneClass(ev.id), { 'cal-modal__row--done': ev.is_done }]"
            >
              <!-- U17: ô tick + vạch màu + tên là MỘT label — bấm tên = đánh dấu xong; sửa chỉ qua ✎. -->
              <label class="cal-modal__row-main" :title="t('calendar.modal.aria.toggleDone')">
                <input
                  type="checkbox"
                  class="cal-modal__check"
                  :checked="ev.is_done"
                  @change="onToggleDone(ev.id, $event)"
                  @click.stop
                />
                <span class="cal-modal__swatch" aria-hidden="true" />
                <span class="cal-modal__row-title">{{ ev.title }}</span>
              </label>
              <!-- U15: ✎ / 🗑 như menu ⚙ của thư mục, ghi chú — hiện khi rê chuột / focus. -->
              <button
                type="button"
                class="ds-icon-action cal-modal__row-act"
                :aria-label="t('calendar.modal.aria.edit')"
                :title="t('calendar.modal.aria.edit')"
                @click.stop="startEdit(ev)"
              >
                <AppIcon name="pencil" />
              </button>
              <button
                type="button"
                class="ds-icon-action ds-icon-action--danger cal-modal__row-act"
                :aria-label="t('calendar.modal.aria.delete')"
                :title="t('calendar.modal.aria.delete')"
                @click="requestDelete(ev.id, $event)"
              >
                <AppIcon name="trash" />
              </button>
            </li>
          </ul>
        </div>

        <form v-else class="cal-form" @submit.prevent="saveForm">
          <div class="cal-form__group">
            <div class="cal-form__label-row">
              <label class="ds-label" :for="`${headingId}-title`">{{ t('calendar.modal.field.title') }}</label>
              <span class="ds-label__meta cal-form__counter" aria-hidden="true">
                {{ formTitle.length }}/{{ CALENDAR_TITLE_MAX }}
              </span>
            </div>
            <RetroInput
              :id="`${headingId}-title`"
              ref="titleInputRef"
              class="cal-form__input"
              :model-value="formTitle"
              :maxlength="CALENDAR_TITLE_MAX"
              :placeholder="t('calendar.modal.field.titlePlaceholder')"
              autocomplete="off"
              @update:model-value="formTitle = $event"
            />
            <p v-if="validationError" class="cal-form__error" role="alert">{{ validationError }}</p>
          </div>

          <div v-if="isCreating" class="cal-form__group">
            <span :id="`${headingId}-repeat`" class="ds-label">{{ t('calendar.modal.field.repeat') }}</span>
            <div
              ref="repeatGroupRef"
              class="cal-form__segmented"
              role="radiogroup"
              :aria-labelledby="`${headingId}-repeat`"
              @keydown="onRepeatKeydown"
            >
              <button
                v-for="f in REPEAT_OPTIONS"
                :key="f"
                type="button"
                role="radio"
                class="cal-form__segment"
                :class="{ 'cal-form__segment--on': repeatFreq === f }"
                :aria-checked="repeatFreq === f"
                :tabindex="repeatFreq === f ? 0 : -1"
                :disabled="busy"
                @click="repeatFreq = f"
              >
                {{ t(REPEAT_LABEL[f]) }}
              </button>
            </div>

            <template v-if="repeatFreq !== 'none'">
              <div class="cal-form__count-row">
                <label class="ds-label" :for="`${headingId}-repeat-count`">{{ t('calendar.repeat.count') }}</label>
                <div class="cal-form__stepper">
                  <button
                    type="button"
                    class="cal-form__step"
                    :aria-label="t('calendar.repeat.decrease')"
                    :title="t('calendar.repeat.decrease')"
                    :disabled="busy || repeatCount <= 2"
                    @click="stepRepeat(-1)"
                  >
                    <AppIcon name="minus" :size="14" />
                  </button>
                  <input
                    :id="`${headingId}-repeat-count`"
                    v-model.number="repeatCount"
                    type="number"
                    class="cal-form__count"
                    :min="2"
                    :max="repeatMax"
                    :disabled="busy"
                    @change="onRepeatCountChange"
                  />
                  <button
                    type="button"
                    class="cal-form__step"
                    :aria-label="t('calendar.repeat.increase')"
                    :title="t('calendar.repeat.increase')"
                    :disabled="busy || repeatCount >= repeatMax"
                    @click="stepRepeat(1)"
                  >
                    <AppIcon name="plus" :size="14" />
                  </button>
                </div>
                <span class="cal-form__until">{{ t('calendar.repeat.until', { date: repeatUntil }) }}</span>
              </div>

              <div class="cal-form__preview">
                <p class="ds-label cal-form__preview-label">
                  {{ t('calendar.repeat.preview')
                  }}<span class="ds-label__meta"> · {{ t('calendar.repeat.previewCount', { n: createCount }) }}</span>
                </p>
                <ul class="cal-form__chips">
                  <li
                    v-for="k in previewCompact.shown"
                    :key="k"
                    class="cal-form__chip"
                    :class="{ 'cal-form__chip--skip': fullDaySet.has(k) }"
                    :title="fullDaySet.has(k) ? t('calendar.repeat.skipChip', { max: CALENDAR_MAX_EVENTS_PER_DAY }) : longDate(k)"
                  >
                    {{ shortDate(k) }}
                  </li>
                  <li
                    v-if="previewCompact.hidden > 0"
                    class="cal-form__chip cal-form__chip--more"
                    :title="t('calendar.repeat.moreDates', { n: previewCompact.hidden })"
                  >
                    +{{ previewCompact.hidden }}
                  </li>
                  <li
                    v-if="previewCompact.last"
                    class="cal-form__chip"
                    :class="{ 'cal-form__chip--skip': fullDaySet.has(previewCompact.last) }"
                    :title="
                      fullDaySet.has(previewCompact.last)
                        ? t('calendar.repeat.skipChip', { max: CALENDAR_MAX_EVENTS_PER_DAY })
                        : longDate(previewCompact.last)
                    "
                  >
                    {{ shortDate(previewCompact.last) }}
                  </li>
                </ul>
                <p v-if="repeatFullDays.length > 0" class="cal-form__warn">
                  <AppIcon name="alert" :size="14" class="cal-form__warn-icon" />
                  {{ t('calendar.repeat.previewSkip', { n: repeatFullDays.length, max: CALENDAR_MAX_EVENTS_PER_DAY }) }}
                </p>
              </div>
            </template>
          </div>

          <div class="cal-form__actions">
            <!-- U15: xóa = 🗑 như ở danh sách ngày (không còn chữ "Xóa" riêng ở đây). -->
            <button
              v-if="!isCreating && store.activeEventId"
              type="button"
              class="ds-icon-action ds-icon-action--danger"
              :aria-label="t('calendar.modal.aria.delete')"
              :title="t('calendar.modal.aria.delete')"
              :disabled="busy"
              @click="requestDeleteActive"
            >
              <AppIcon name="trash" :size="17" />
            </button>
            <span class="cal-form__spacer" />
            <button type="button" class="ds-text-action ds-text-action--muted" :disabled="busy" @click="cancelForm">
              {{ t('calendar.modal.btn.cancel') }}
            </button>
            <button type="submit" class="ds-primary" :disabled="busy">
              {{
                isCreating && repeatFreq !== 'none'
                  ? t('calendar.repeat.saveN', { n: createCount })
                  : t('calendar.modal.btn.save')
              }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>

  <RetroConfirm
    v-model:open="confirmOpen"
    variant="danger"
    :title="t('calendar.modal.confirmDeleteTitle')"
    :message="t('calendar.modal.confirmDeleteDetail')"
    @confirm="confirmDelete"
    @cancel="onCancelDelete"
  />
</template>

<style scoped>
.cal-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 8500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-scrim);
  padding: 16px;
}

/* Một tấm phẳng như bảng "Lịch sắp tới" — viền duy nhất của hộp thoại. */
.cal-modal {
  width: 100%;
  max-width: 440px;
  max-height: min(92vh, 560px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  box-shadow: 0 18px 48px var(--panel-ring);
  overflow: hidden;
}

.cal-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 12px 6px 20px;
  flex-shrink: 0;
}

.cal-modal__heading {
  min-width: 0;
}

.cal-modal__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-primary);
}

.cal-modal__subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

/* —— Danh sách ngày —— */
.cal-modal__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 4px 10px 12px;
  overflow-y: auto;
}

.cal-modal__hint,
.cal-modal__empty {
  margin: 2px 10px 8px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

.cal-modal__empty {
  margin-top: 6px;
  font-size: var(--font-size-sm);
}

.cal-modal__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.cal-modal__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 4px 4px 10px;
}

.cal-modal__check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

/* Vạch màu của sự kiện (tone theo id — cùng màu với lưới tháng). */
.cal-modal__swatch {
  flex: 0 0 auto;
  width: 3px;
  height: 18px;
  border-radius: 2px;
  background: var(--cal-event-rail);
}

.cal-modal__row-main {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 6px 0;
  cursor: pointer;
}

.cal-modal__row-title {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-modal__row-main:has(.cal-modal__check:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.cal-modal__row--done .cal-modal__row-title {
  color: var(--text-muted);
  text-decoration: line-through;
}

.cal-modal__row--done .cal-modal__swatch {
  opacity: 0.45;
}

/* ✎ 🗑 chỉ hiện khi rê chuột / focus trong dòng. */
.cal-modal__row-act {
  opacity: 0;
}

.cal-modal__row:hover .cal-modal__row-act,
.cal-modal__row:focus-within .cal-modal__row-act {
  opacity: 1;
}

@media (hover: none) {
  .cal-modal__row-act {
    opacity: 1;
  }
}

/* —— Form tạo / sửa —— */
.cal-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  padding: 10px 20px 16px;
  overflow-y: auto;
}

.cal-form__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cal-form__label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.cal-form__counter {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* Ô phẳng: nền xám nhạt, không viền; focus = nền tấm + vòng nhấn (giống ô tìm). */
.cal-form__input {
  padding: 10px 12px;
  border-color: transparent;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
  font-size: 14px;
  transition:
    background 0.12s linear,
    box-shadow 0.12s linear;
}

.cal-form__input:focus,
.cal-form__input:focus-visible {
  outline: none;
  border-color: transparent;
  background: var(--bg-panel);
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.cal-form__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

/* Segmented control: rãnh xám, ô đang chọn nổi lên. */
.cal-form__segmented {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
}

.cal-form__segment {
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition:
    background 0.12s linear,
    color 0.12s linear;
}

.cal-form__segment:hover:not(:disabled):not(.cal-form__segment--on) {
  color: var(--text-primary);
}

.cal-form__segment--on {
  background: var(--bg-panel);
  color: var(--accent);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 1px 6px rgba(0, 0, 0, 0.06);
}

html[data-theme='dark'] .cal-form__segment--on {
  background: color-mix(in srgb, var(--text-primary) 14%, var(--bg-panel));
}

.cal-form__segment:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.cal-form__count-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
}

.cal-form__stepper {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
}

.cal-form__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.12s linear;
}

.cal-form__step:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text-primary) 9%, transparent);
}

.cal-form__step:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.cal-form__step:focus-visible,
.cal-form__count:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.cal-form__count {
  width: 34px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  appearance: textfield;
  -moz-appearance: textfield;
}

.cal-form__count::-webkit-inner-spin-button,
.cal-form__count::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.cal-form__until {
  min-width: 0;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-form__preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.cal-form__preview-label {
  margin: 0;
}

/* Chip ngày: tự xuống dòng nguyên chip — không còn câu dài bị cắt giữa ngày. */
.cal-form__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cal-form__chip {
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-accent-muted);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cal-form__chip--more {
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
  color: var(--text-muted);
}

.cal-form__chip--skip {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
  text-decoration: line-through;
}

.cal-form__warn {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--danger);
}

.cal-form__warn-icon {
  margin-top: 1px;
}

.cal-form__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 2px;
}

.cal-form__spacer {
  flex: 1 1 auto;
}

@media (prefers-reduced-motion: reduce) {
  .cal-form__input,
  .cal-form__segment,
  .cal-form__step {
    transition: none;
  }
}
</style>
