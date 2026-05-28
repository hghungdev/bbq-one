<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { CALENDAR_MAX_EVENTS_PER_DAY } from '@/constants/calendar'
import RetroButton from '@/components/ui/RetroButton.vue'
import type {
  CalendarDayKeepSelection,
  CalendarOverflowReport,
} from '@/services/localFirst/calendarOverflowResolver.service'
import { useLangStore } from '@/stores/uiLang'
import { formatCalendarBannerDate } from '@/utils/calendarDate'

const props = defineProps<{
  report: CalendarOverflowReport
  visible: boolean
}>()

const emit = defineEmits<{
  save: [selections: CalendarDayKeepSelection[]]
  cancel: []
}>()

const langStore = useLangStore()
const { t } = langStore
const { lang } = storeToRefs(langStore)

const pageIndex = ref(0)
const validationError = ref<string | null>(null)

/** dateKey → Set of selected event ids */
const pickedByDate = reactive<Record<string, Set<string>>>({})

function initPicks(): void {
  for (const key of Object.keys(pickedByDate)) delete pickedByDate[key]
  for (const day of props.report.days) {
    pickedByDate[day.dateKey] = new Set()
  }
  pageIndex.value = 0
  validationError.value = null
}

watch(
  () => props.report,
  () => initPicks(),
  { immediate: true },
)

watch(
  () => props.visible,
  (v) => {
    if (v) initPicks()
  },
)

const totalPages = computed(() => props.report.days.length)
const currentDay = computed(() => props.report.days[pageIndex.value] ?? null)
const isLastPage = computed(() => pageIndex.value >= totalPages.value - 1)
const isFirstPage = computed(() => pageIndex.value === 0)

const dateLabel = computed(() => {
  const day = currentDay.value
  if (!day) return ''
  return formatCalendarBannerDate(day.dateKey, lang.value)
})

const selectedCount = computed(() => {
  const day = currentDay.value
  if (!day) return 0
  return pickedByDate[day.dateKey]?.size ?? 0
})

function isChecked(eventId: string): boolean {
  const day = currentDay.value
  if (!day) return false
  return pickedByDate[day.dateKey]?.has(eventId) ?? false
}

function canCheckMore(): boolean {
  return selectedCount.value < CALENDAR_MAX_EVENTS_PER_DAY
}

function onToggleEvent(eventId: string, checked: boolean): void {
  const day = currentDay.value
  if (!day) return
  const set = pickedByDate[day.dateKey]
  if (!set) return
  if (checked) {
    if (!canCheckMore()) return
    set.add(eventId)
  } else {
    set.delete(eventId)
  }
  validationError.value = null
}

function validateCurrentPage(): boolean {
  const day = currentDay.value
  if (!day) return true
  const n = pickedByDate[day.dateKey]?.size ?? 0
  if (n > CALENDAR_MAX_EVENTS_PER_DAY) {
    validationError.value = t('calendar.overflow.validationMax', {
      max: CALENDAR_MAX_EVENTS_PER_DAY,
    })
    return false
  }
  validationError.value = null
  return true
}

function goNext(): void {
  if (!validateCurrentPage()) return
  if (!isLastPage.value) pageIndex.value++
}

function goPrev(): void {
  validationError.value = null
  if (!isFirstPage.value) pageIndex.value--
}

function buildSelections(): CalendarDayKeepSelection[] {
  return props.report.days.map((day) => ({
    dateKey: day.dateKey,
    keepIds: [...(pickedByDate[day.dateKey] ?? [])],
  }))
}

function onSaveAll(): void {
  for (const day of props.report.days) {
    const n = pickedByDate[day.dateKey]?.size ?? 0
    if (n > CALENDAR_MAX_EVENTS_PER_DAY) {
      validationError.value = t('calendar.overflow.validationMax', {
        max: CALENDAR_MAX_EVENTS_PER_DAY,
      })
      return
    }
  }
  validationError.value = null
  emit('save', buildSelections())
}

function sourceLabel(source: 'local' | 'cloud'): string {
  return source === 'local'
    ? t('calendar.overflow.sourceLocal')
    : t('calendar.overflow.sourceCloud')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cal-overflow-fade">
      <div
        v-if="visible && currentDay"
        class="cal-overflow-overlay bbqone-overlay"
        role="presentation"
        @click.self="emit('cancel')"
      >
        <div
          class="cal-overflow-dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="'cal-overflow-title'"
          @click.stop
        >
          <header class="cal-overflow-dialog__header">
            <h2 id="cal-overflow-title" class="cal-overflow-dialog__title">
              {{ t('calendar.overflow.title') }}
            </h2>
            <RetroButton
              variant="sm"
              type="button"
              class="cal-overflow-dialog__close"
              :aria-label="t('common.close')"
              @click="emit('cancel')"
            >
              {{ t('common.bracketClear') }}
            </RetroButton>
          </header>

          <p class="cal-overflow-dialog__intro">
            {{
              t('calendar.overflow.intro', {
                date: dateLabel,
                total: currentDay.events.length,
                max: currentDay.maxAllowed,
              })
            }}
          </p>

          <p class="cal-overflow-dialog__pager">
            {{
              t('calendar.overflow.page', {
                current: pageIndex + 1,
                total: totalPages,
              })
            }}
          </p>

          <p v-if="validationError" class="cal-overflow-dialog__error" role="alert">
            {{ validationError }}
          </p>

          <ul class="cal-overflow-dialog__list">
            <li v-for="ev in currentDay.events" :key="ev.id" class="cal-overflow-dialog__row">
              <label class="cal-overflow-dialog__label">
                <input
                  type="checkbox"
                  class="cal-overflow-dialog__check"
                  :checked="isChecked(ev.id)"
                  :disabled="!isChecked(ev.id) && !canCheckMore()"
                  @change="onToggleEvent(ev.id, ($event.target as HTMLInputElement).checked)"
                />
                <span class="cal-overflow-dialog__title-text">{{ ev.title }}</span>
                <span class="cal-overflow-dialog__tag">{{ sourceLabel(ev.source) }}</span>
                <span v-if="ev.is_done" class="cal-overflow-dialog__done">
                  {{ t('calendar.search.doneTag') }}
                </span>
              </label>
            </li>
          </ul>

          <p class="cal-overflow-dialog__hint">
            {{
              t('calendar.overflow.pickHint', {
                selected: selectedCount,
                max: currentDay.maxAllowed,
              })
            }}
          </p>

          <footer class="cal-overflow-dialog__actions">
            <RetroButton variant="sm" type="button" @click="emit('cancel')">
              {{ t('calendar.modal.btn.cancel') }}
            </RetroButton>
            <RetroButton
              v-if="!isFirstPage"
              variant="sm"
              type="button"
              @click="goPrev"
            >
              {{ t('calendar.overflow.btn.prev') }}
            </RetroButton>
            <RetroButton
              v-if="!isLastPage"
              variant="sm"
              type="button"
              @click="goNext"
            >
              {{ t('calendar.overflow.btn.next') }}
            </RetroButton>
            <RetroButton
              v-if="isLastPage"
              variant="sm"
              type="button"
              @click="onSaveAll"
            >
              {{ t('calendar.overflow.btn.save') }}
            </RetroButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cal-overflow-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--overlay-scrim);
}

.cal-overflow-dialog {
  width: min(480px, 100%);
  max-height: min(90vh, 560px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
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
}

.cal-overflow-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.cal-overflow-dialog__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}

.cal-overflow-dialog__close {
  flex-shrink: 0;
}

.cal-overflow-dialog__intro,
.cal-overflow-dialog__pager,
.cal-overflow-dialog__hint {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.45;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
}

.cal-overflow-dialog__pager {
  color: var(--text-muted);
}

.cal-overflow-dialog__error {
  margin: 0;
  padding: 7px 9px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
}

.cal-overflow-dialog__list {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
}

.cal-overflow-dialog__row {
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel) 58%, transparent);
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.cal-overflow-dialog__row:hover {
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
}

.cal-overflow-dialog__label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: var(--font-size-sm);
}

.cal-overflow-dialog__check {
  flex: 0 0 auto;
  accent-color: var(--accent);
}

.cal-overflow-dialog__title-text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-primary);
}

.cal-overflow-dialog__tag {
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
}

.cal-overflow-dialog__done {
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  color: var(--sync-done);
}

.cal-overflow-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
}

.cal-overflow-fade-enter-active,
.cal-overflow-fade-leave-active {
  transition: opacity 0.15s ease;
}

.cal-overflow-fade-enter-from,
.cal-overflow-fade-leave-to {
  opacity: 0;
}
</style>
