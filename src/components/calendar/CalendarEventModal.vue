<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, useId } from 'vue'
import { storeToRefs } from 'pinia'
import { CALENDAR_MAX_EVENTS_PER_DAY, CALENDAR_TITLE_MAX } from '@/constants/calendar'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useLangStore } from '@/stores/uiLang'
import IconButton from '@/components/ui/IconButton.vue'
import IconDeleteButton from '@/components/ui/IconDeleteButton.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import type { CalendarEvent } from '@/types/calendar'
import type { I18nKey } from '@/i18n/en'
import { formatCalendarBannerDate, isPastLocalDay, parseLocalDate } from '@/utils/calendarDate'
import { calendarEventToneClass } from '@/utils/calendarEventTone'
import {
  RECURRENCE_DEFAULT_COUNT,
  RECURRENCE_MAX_COUNT,
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

/** U3: lặp lại — chỉ khi tạo mới. Mỗi lần lặp là một sự kiện riêng. */
const REPEAT_OPTIONS: RecurrenceFreq[] = ['none', 'weekly', 'monthly', 'yearly']
const REPEAT_LABEL: Record<RecurrenceFreq, I18nKey> = {
  none: 'calendar.repeat.none',
  weekly: 'calendar.repeat.weekly',
  monthly: 'calendar.repeat.monthly',
  yearly: 'calendar.repeat.yearly',
}
const PREVIEW_DATES_SHOWN = 5
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

const repeatPreview = computed(() => {
  const dates = repeatDates.value
  if (dates.length === 0) return ''
  const shown = dates.slice(0, PREVIEW_DATES_SHOWN).map(shortDate).join(', ')
  const tail = dates.length > PREVIEW_DATES_SHOWN ? ` … → ${shortDate(dates[dates.length - 1])}` : ''
  return t('calendar.repeat.preview', { n: dates.length, dates: shown + tail })
})

watch(repeatFreq, (f) => {
  if (f !== 'none') repeatCount.value = RECURRENCE_DEFAULT_COUNT[f]
})

function onRepeatCountChange(): void {
  const n = Math.floor(Number(repeatCount.value))
  repeatCount.value = Math.min(Math.max(Number.isFinite(n) ? n : 2, 2), repeatMax.value)
}

const modalHeading = computed(() => {
  if (showForm.value) {
    return store.activeEventId
      ? t('calendar.modal.title.edit')
      : t('calendar.modal.title.create')
  }
  return t('calendar.modal.title.list', {
    date: formatCalendarBannerDate(activeDateKey.value, lang.value),
  })
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
        <header class="cal-modal__header">
          <h2 :id="headingId" class="cal-modal__title">{{ modalHeading }}</h2>
          <IconButton
            variant="default"
            :label="t('common.close')"
            @click="store.closeModal"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </IconButton>
        </header>

        <p v-if="validationError" class="cal-modal__error" role="alert">
          {{ validationError }}
        </p>
        <p v-if="resultInfo && !showForm" class="cal-modal__past-hint" role="status">
          {{ resultInfo }}
        </p>

        <template v-if="!showForm">
          <div v-if="!isPastActiveDate && !dayIsFull" class="cal-modal__toolbar">
            <IconButton
              variant="accent"
              :label="t('calendar.modal.aria.add')"
              :disabled="busy"
              @click="startCreate"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  d="M12 5v14M5 12h14"
                />
              </svg>
            </IconButton>
            <span class="cal-modal__toolbar-label">{{ t('calendar.modal.aria.add') }}</span>
          </div>
          <p v-else-if="isPastActiveDate" class="cal-modal__past-hint">{{ t('calendar.modal.pastDayNoAdd') }}</p>
          <p v-else-if="dayIsFull" class="cal-modal__past-hint">{{ t('calendar.modal.dayFull', { max: CALENDAR_MAX_EVENTS_PER_DAY }) }}</p>
          <p v-if="!dayEvents.length" class="cal-modal__empty">{{ t('calendar.modal.empty') }}</p>
          <ul v-else class="cal-modal__list">
            <li
              v-for="ev in dayEvents"
              :key="ev.id"
              class="cal-modal__row"
              :class="calendarEventToneClass(ev.id)"
            >
              <input
                type="checkbox"
                class="cal-modal__check"
                :checked="ev.is_done"
                :aria-label="t('calendar.modal.aria.toggleDone')"
                @change="onToggleDone(ev.id, $event)"
                @click.stop
              />
              <button
                type="button"
                class="cal-modal__row-title"
                :class="{ 'cal-modal__row-title--done': ev.is_done }"
                @click.stop="startEdit(ev)"
              >
                {{ ev.title }}
              </button>
              <IconDeleteButton
                :title="t('calendar.modal.aria.delete')"
                @click="requestDelete(ev.id, $event)"
              />
            </li>
          </ul>
        </template>

        <form v-else class="cal-modal__form" @submit.prevent="saveForm">
          <label class="cal-modal__field">
            <span class="cal-modal__label">{{ t('calendar.modal.field.title') }}</span>
            <RetroInput
              :id="`${headingId}-title`"
              :model-value="formTitle"
              :maxlength="CALENDAR_TITLE_MAX"
              :placeholder="t('calendar.modal.field.titlePlaceholder')"
              @update:model-value="formTitle = $event"
            />
          </label>
          <div v-if="isCreating" class="cal-modal__field">
            <label class="cal-modal__label" :for="`${headingId}-repeat`">
              {{ t('calendar.modal.field.repeat') }}
            </label>
            <div class="cal-modal__repeat-row">
              <select
                :id="`${headingId}-repeat`"
                v-model="repeatFreq"
                class="cal-modal__select"
                :disabled="busy"
              >
                <option v-for="f in REPEAT_OPTIONS" :key="f" :value="f">
                  {{ t(REPEAT_LABEL[f]) }}
                </option>
              </select>
              <template v-if="repeatFreq !== 'none'">
                <label class="cal-modal__label" :for="`${headingId}-repeat-count`">
                  {{ t('calendar.repeat.count') }}
                </label>
                <input
                  :id="`${headingId}-repeat-count`"
                  v-model.number="repeatCount"
                  type="number"
                  class="cal-modal__count"
                  :min="2"
                  :max="repeatMax"
                  :disabled="busy"
                  @change="onRepeatCountChange"
                />
              </template>
            </div>
            <p v-if="repeatPreview" class="cal-modal__repeat-preview">{{ repeatPreview }}</p>
            <p v-if="repeatFullDays.length > 0" class="cal-modal__repeat-warn">
              {{ t('calendar.repeat.previewSkip', { n: repeatFullDays.length, max: CALENDAR_MAX_EVENTS_PER_DAY }) }}
            </p>
          </div>
          <div class="cal-modal__form-actions">
            <RetroButton variant="sm" type="button" :disabled="busy" @click="cancelForm">
              {{ t('calendar.modal.btn.cancel') }}
            </RetroButton>
            <RetroButton variant="sm" type="submit" :disabled="busy">
              {{ t('calendar.modal.btn.save') }}
            </RetroButton>
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

.cal-modal {
  width: 100%;
  max-width: 420px;
  max-height: min(90vh, 520px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--accent) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  box-shadow: 0 18px 54px var(--panel-ring);
  overflow: hidden;
}

.cal-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 10px 10px 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.cal-modal__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.35;
  letter-spacing: 0;
}

.cal-modal__error {
  margin: 10px 10px 0;
  padding: 8px 10px;
  font-size: var(--font-size-xs);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
}

.cal-modal__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px;
  padding: 8px 10px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 68%, transparent);
}

.cal-modal__toolbar-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.cal-modal__past-hint {
  margin: 0;
  margin: 10px;
  padding: 8px 10px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.45;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 68%, transparent);
}

.cal-modal__empty {
  margin: 0;
  margin: 10px;
  padding: 20px 12px;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.cal-modal__list {
  list-style: none;
  margin: 0;
  padding: 10px;
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
}

.cal-modal__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel) 58%, transparent);
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.cal-modal__row:hover {
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
}

.cal-modal__check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.cal-modal__row-title {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  padding: 8px 4px;
  border-radius: var(--radius-md);
}

.cal-modal__row-title:hover {
  color: var(--accent);
}

.cal-modal__row-title--done {
  color: var(--text-muted);
  text-decoration: line-through;
}

.cal-modal__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 10px 10px;
  overflow-y: auto;
  min-height: 0;
}

.cal-modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 62%, transparent);
}

.cal-modal__label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.cal-modal__repeat-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.cal-modal__select,
.cal-modal__count {
  padding: 8px 12px;
  font-family: inherit;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-pill);
}

.cal-modal__select {
  flex: 1 1 140px;
  cursor: pointer;
}

.cal-modal__count {
  width: 72px;
}

.cal-modal__select:focus-visible,
.cal-modal__count:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.cal-modal__repeat-preview,
.cal-modal__repeat-warn {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.4;
  color: var(--text-muted);
}

.cal-modal__repeat-warn {
  color: var(--danger);
}

.cal-modal__form-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 0;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
}
</style>
