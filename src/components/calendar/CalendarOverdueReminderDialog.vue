<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import IconButton from '@/components/ui/IconButton.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import type { OverdueCalendarDayGroup } from '@/services/calendarOverdueReminder.service'
import { useLangStore } from '@/stores/uiLang'
import { formatCalendarBannerDate } from '@/utils/calendarDate'

const props = defineProps<{
  visible: boolean
  groups: OverdueCalendarDayGroup[]
}>()

const emit = defineEmits<{
  close: []
  confirm: [checkedIds: string[]]
}>()

const langStore = useLangStore()
const { t } = langStore
const { lang } = storeToRefs(langStore)

const checkedIds = ref<Set<string>>(new Set())
const busy = ref(false)

const totalEvents = computed(() =>
  props.groups.reduce((sum, g) => sum + g.events.length, 0),
)

function resetChecks(): void {
  checkedIds.value = new Set()
}

watch(
  () => props.visible,
  (open) => {
    if (open) resetChecks()
  },
)

function dateLabel(dateKey: string): string {
  return formatCalendarBannerDate(dateKey, lang.value)
}

function isChecked(id: string): boolean {
  return checkedIds.value.has(id)
}

function toggleCheck(id: string, checked: boolean): void {
  const next = new Set(checkedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  checkedIds.value = next
}

function onClose(): void {
  if (busy.value) return
  emit('close')
}

async function onConfirm(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const ids = [...checkedIds.value]
    emit('confirm', ids)
  } finally {
    busy.value = false
  }
}

function onBackdropClick(): void {
  onClose()
}

function onKeydown(e: KeyboardEvent): void {
  if (!props.visible) return
  if (e.key === 'Escape') {
    e.preventDefault()
    onClose()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="cal-overdue__backdrop"
      role="presentation"
      @click.self="onBackdropClick"
    >
      <div
        class="cal-overdue"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cal-overdue-title"
        @click.stop
      >
        <header class="cal-overdue__header">
          <h2 id="cal-overdue-title" class="cal-overdue__title">
            {{ t('calendar.overdue.title') }}
          </h2>
          <IconButton variant="default" :label="t('common.close')" @click="onClose">
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

        <p class="cal-overdue__intro">
          {{ t('calendar.overdue.intro', { n: totalEvents }) }}
        </p>

        <div class="cal-overdue__scroll">
          <section
            v-for="group in groups"
            :key="group.dateKey"
            class="cal-overdue__day"
          >
            <h3 class="cal-overdue__day-title">{{ dateLabel(group.dateKey) }}</h3>
            <ul class="cal-overdue__list">
              <li v-for="ev in group.events" :key="ev.id" class="cal-overdue__row">
                <input
                  :id="`cal-overdue-${ev.id}`"
                  type="checkbox"
                  class="cal-overdue__check"
                  :checked="isChecked(ev.id)"
                  @change="toggleCheck(ev.id, ($event.target as HTMLInputElement).checked)"
                />
                <label :for="`cal-overdue-${ev.id}`" class="cal-overdue__label">
                  {{ ev.title }}
                </label>
              </li>
            </ul>
          </section>
        </div>

        <footer class="cal-overdue__footer">
          <RetroButton variant="sm" type="button" :disabled="busy" @click="onClose">
            {{ t('calendar.overdue.btnLater') }}
          </RetroButton>
          <RetroButton variant="sm" type="button" :disabled="busy" @click="onConfirm">
            {{ t('calendar.overdue.btnConfirm') }}
          </RetroButton>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cal-overdue__backdrop {
  position: fixed;
  inset: 0;
  z-index: 8600;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-scrim);
  padding: 16px;
}

.cal-overdue {
  width: 100%;
  max-width: 440px;
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

.cal-overdue__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 10px 10px 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  flex-shrink: 0;
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.cal-overdue__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
}

.cal-overdue__intro {
  margin: 0;
  margin: 10px;
  padding: 9px 10px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.45;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
  flex-shrink: 0;
}

.cal-overdue__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 10px 12px;
}

.cal-overdue__day + .cal-overdue__day {
  margin-top: 12px;
}

.cal-overdue__day-title {
  margin: 0 0 6px;
  padding: 6px 9px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.012em;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
}

.cal-overdue__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.cal-overdue__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 8px;
  margin-bottom: 5px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel) 58%, transparent);
}

.cal-overdue__row:hover {
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
}

.cal-overdue__check {
  margin-top: 2px;
  flex-shrink: 0;
  accent-color: var(--accent);
}

.cal-overdue__label {
  flex: 1 1 auto;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  line-height: 1.4;
  cursor: pointer;
}

.cal-overdue__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0 10px 10px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  flex-shrink: 0;
  background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
}
</style>
