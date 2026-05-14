<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, useId } from 'vue'
import { CALENDAR_MAX_EVENTS_PER_DAY, CALENDAR_TITLE_MAX } from '@/constants/calendar'
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { useLangStore } from '@/stores/uiLang'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import type { CalendarEvent } from '@/types/calendar'
import { isPastLocalDay } from '@/utils/calendarDate'

const store = useCalendarEventsStore()
const { t } = useLangStore()

const headingId = useId()
const isCreating = ref(false)
const formTitle = ref('')
const validationError = ref<string | null>(null)
const busy = ref(false)
const confirmOpen = ref(false)
const pendingDeleteId = ref<string | null>(null)

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

const modalHeading = computed(() => {
  if (showForm.value) {
    return store.activeEventId
      ? t('calendar.modal.title.edit')
      : t('calendar.modal.title.create')
  }
  return t('calendar.modal.title.list', { date: activeDateKey.value })
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
}

function startEdit(ev: CalendarEvent): void {
  store.openModalForEdit(ev.id)
  isCreating.value = false
  validationError.value = null
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
      await store.createEvent({
        event_date: activeDateKey.value,
        title,
        description: '',
      })
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
          <RetroButton
            variant="sm"
            type="button"
            class="cal-modal__close"
            :aria-label="t('common.close')"
            @click="store.closeModal"
          >
            {{ t('common.bracketClear') }}
          </RetroButton>
        </header>

        <p v-if="validationError" class="cal-modal__error" role="alert">
          {{ validationError }}
        </p>

        <template v-if="!showForm">
          <div v-if="!isPastActiveDate && !dayIsFull" class="cal-modal__toolbar">
            <RetroButton variant="sm" type="button" :disabled="busy" @click="startCreate">
              {{ t('calendar.modal.btn.add') }}
            </RetroButton>
          </div>
          <p v-else-if="isPastActiveDate" class="cal-modal__past-hint">{{ t('calendar.modal.pastDayNoAdd') }}</p>
          <p v-else-if="dayIsFull" class="cal-modal__past-hint">{{ t('calendar.modal.dayFull', { max: CALENDAR_MAX_EVENTS_PER_DAY }) }}</p>
          <p v-if="!dayEvents.length" class="cal-modal__empty">{{ t('calendar.modal.empty') }}</p>
          <ul v-else class="cal-modal__list">
            <li v-for="ev in dayEvents" :key="ev.id" class="cal-modal__row">
              <input
                type="checkbox"
                class="cal-modal__check"
                :checked="ev.is_done"
                :aria-label="t('calendar.modal.aria.toggleDone')"
                @change="onToggleDone(ev.id, $event)"
                @click.stop
              />
              <button type="button" class="cal-modal__row-title" @click.stop="startEdit(ev)">
                {{ ev.title }}
              </button>
              <RetroButton
                variant="sm"
                type="button"
                class="cal-modal__del"
                :title="t('calendar.modal.btn.delete')"
                @click="requestDelete(ev.id, $event)"
              >
                {{ t('calendar.modal.btn.delete') }}
              </RetroButton>
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
    :message="t('calendar.modal.confirmDelete')"
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
  background: var(--bg-secondary);
  box-shadow: 0 12px 48px var(--panel-ring);
}

.cal-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.cal-modal__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.06em;
  line-height: 1.3;
}

.cal-modal__close {
  min-width: auto;
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: var(--font-size-sm);
}

.cal-modal__error {
  margin: 0;
  padding: 8px 12px;
  font-size: var(--font-size-xs);
  color: var(--danger);
}

.cal-modal__toolbar {
  padding: 8px 12px;
  flex-shrink: 0;
}

.cal-modal__past-hint {
  margin: 0;
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.45;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.cal-modal__empty {
  margin: 0;
  padding: 20px 12px;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.cal-modal__list {
  list-style: none;
  margin: 0;
  padding: 0 8px 12px;
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
}

.cal-modal__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border);
}

.cal-modal__check {
  flex-shrink: 0;
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
  text-decoration: underline;
  text-underline-offset: 2px;
  padding: 4px 0;
}

.cal-modal__row-title:hover {
  color: var(--accent);
}

.cal-modal__del {
  min-width: auto;
  flex-shrink: 0;
}

.cal-modal__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
  min-height: 0;
}

.cal-modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cal-modal__label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.cal-modal__form-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
