<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import IconButton from '@/components/ui/IconButton.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import type { OverdueCalendarDayGroup } from '@/services/calendarOverdueReminder.service'
import { useLangStore } from '@/stores/uiLang'
import { selectRange, selectionState, toggleMany } from '@/utils/bulkSelection'
import { formatCalendarBannerDate } from '@/utils/calendarDate'
import AppIcon from '@/components/ui/AppIcon.vue'

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
/** Mục bấm gần nhất — Shift + bấm chọn liên tiếp từ đây (U7). */
const anchorId = ref<string | null>(null)
const busy = ref(false)
const selectAllRef = ref<HTMLInputElement | null>(null)

/** Thứ tự hiển thị (ngày cũ → mới, trong ngày theo position) — dùng cho chọn liên tiếp. */
const allIds = computed(() => props.groups.flatMap((g) => g.events.map((e) => e.id)))
const totalEvents = computed(() => allIds.value.length)
const selectedCount = computed(() => allIds.value.filter((id) => checkedIds.value.has(id)).length)
const allState = computed(() => selectionState(allIds.value, checkedIds.value))

function dayIds(group: OverdueCalendarDayGroup): string[] {
  return group.events.map((e) => e.id)
}

function dayState(group: OverdueCalendarDayGroup): 'none' | 'some' | 'all' {
  return selectionState(dayIds(group), checkedIds.value)
}

// Không chọn sẵn mục nào (tránh lỡ tay đánh dấu xong việc chưa làm); focus "Chọn tất cả" để bàn phím
// dùng được ngay.
watch(
  () => props.visible,
  async (open) => {
    if (!open) return
    checkedIds.value = new Set()
    anchorId.value = null
    await nextTick()
    selectAllRef.value?.focus()
  },
)

function dateLabel(dateKey: string): string {
  return formatCalendarBannerDate(dateKey, lang.value)
}

function isChecked(id: string): boolean {
  return checkedIds.value.has(id)
}

function onToggleAll(): void {
  checkedIds.value = toggleMany(allIds.value, checkedIds.value)
  anchorId.value = null
}

function onToggleDay(group: OverdueCalendarDayGroup): void {
  checkedIds.value = toggleMany(dayIds(group), checkedIds.value)
  anchorId.value = null
}

/** Lúc click chạy, ô đã đổi trạng thái — đọc `checked` mới; Shift → áp cho cả đoạn từ anchor. */
function onRowClick(id: string, e: MouseEvent): void {
  const checked = (e.target as HTMLInputElement).checked
  if (e.shiftKey && anchorId.value !== null) {
    checkedIds.value = selectRange(allIds.value, anchorId.value, id, checked, checkedIds.value)
  } else {
    const next = new Set(checkedIds.value)
    if (checked) next.add(id)
    else next.delete(id)
    checkedIds.value = next
  }
  anchorId.value = id
}

function onClose(): void {
  if (busy.value) return
  emit('close')
}

async function onConfirm(): Promise<void> {
  if (busy.value || selectedCount.value === 0) return
  busy.value = true
  try {
    const ids = allIds.value.filter((id) => checkedIds.value.has(id))
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
    return
  }
  // Ctrl/⌘+A trong hộp thoại: chọn / bỏ chọn tất cả (thay vì bôi đen chữ cả trang).
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    onToggleAll()
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
            <AppIcon name="close" :size="18" />
          </IconButton>
        </header>

        <p class="cal-overdue__intro">
          {{ t('calendar.overdue.intro', { n: totalEvents }) }}
        </p>

        <!-- U7: chọn hàng loạt -->
        <div class="cal-overdue__selectbar">
          <label class="cal-overdue__selectall">
            <input
              ref="selectAllRef"
              type="checkbox"
              class="cal-overdue__check"
              :checked="allState === 'all'"
              :indeterminate="allState === 'some'"
              @change="onToggleAll"
            />
            <span>{{ t('calendar.overdue.selectAll') }}</span>
          </label>
          <span class="cal-overdue__count" aria-live="polite">
            {{ t('calendar.overdue.selectedCount', { n: selectedCount, total: totalEvents }) }}
          </span>
        </div>

        <div class="cal-overdue__scroll">
          <section
            v-for="group in groups"
            :key="group.dateKey"
            class="cal-overdue__day"
          >
            <h3 class="cal-overdue__day-title">
              <label class="cal-overdue__day-label">
                <input
                  type="checkbox"
                  class="cal-overdue__check"
                  :checked="dayState(group) === 'all'"
                  :indeterminate="dayState(group) === 'some'"
                  :aria-label="t('calendar.overdue.selectDay', { date: dateLabel(group.dateKey) })"
                  @change="onToggleDay(group)"
                />
                <span class="cal-overdue__day-date">{{ dateLabel(group.dateKey) }}</span>
                <span class="cal-overdue__day-count">{{ group.events.length }}</span>
              </label>
            </h3>
            <ul class="cal-overdue__list">
              <li v-for="ev in group.events" :key="ev.id">
                <label
                  class="cal-overdue__row"
                  :class="{ 'cal-overdue__row--checked': isChecked(ev.id) }"
                >
                  <input
                    type="checkbox"
                    class="cal-overdue__check"
                    :checked="isChecked(ev.id)"
                    @click="onRowClick(ev.id, $event)"
                  />
                  <span class="cal-overdue__label">{{ ev.title }}</span>
                </label>
              </li>
            </ul>
          </section>
        </div>

        <p class="cal-overdue__tip">{{ t('calendar.overdue.tip') }}</p>

        <footer class="cal-overdue__footer">
          <RetroButton variant="sm" type="button" :disabled="busy" @click="onClose">
            {{ t('calendar.overdue.btnLater') }}
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            class="cal-overdue__primary"
            :disabled="busy || selectedCount === 0"
            @click="onConfirm"
          >
            {{ t('calendar.overdue.btnConfirmCount', { n: selectedCount }) }}
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
  border: none;
  border-radius: 0;
  flex-shrink: 0;
  background: transparent;
  box-shadow: none;
}

.cal-overdue__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
}

.cal-overdue__intro {
  margin: 10px 14px 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.45;
  flex-shrink: 0;
}

/* U7: thanh chọn hàng loạt — nằm ngoài vùng cuộn nên luôn thấy. */
.cal-overdue__selectbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 10px 0;
  padding: 8px 12px 8px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.cal-overdue__selectall {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
}

.cal-overdue__count {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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
  margin: 0 0 4px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.012em;
}

.cal-overdue__day-label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 10px;
  cursor: pointer;
  user-select: none;
}

.cal-overdue__day-date {
  flex: 1 1 auto;
}

.cal-overdue__day-count {
  min-width: 20px;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--text-primary) 7%, transparent);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.cal-overdue__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.cal-overdue__row {
  display: flex;
  align-items: center;
  gap: 10px;
  /* Thụt vào thẳng hàng chữ ngày (ô chọn ngày 16 px + gap 10 px). */
  padding: 7px 10px 7px 36px;
  margin-bottom: 2px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  cursor: pointer;
  user-select: none;
  transition:
    background 0.1s linear,
    border-color 0.1s linear;
}

.cal-overdue__row:hover {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

/* Dòng phẳng (ADN popover): đã chọn = nền nhấn nhạt, không viền. */
.cal-overdue__row--checked,
.cal-overdue__row--checked:hover {
  background: var(--surface-accent-muted);
}

.cal-overdue__row:has(.cal-overdue__check:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.cal-overdue__check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.cal-overdue__label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  line-height: 1.4;
}

.cal-overdue__tip {
  margin: 0 14px 8px;
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* Nút chính đặc màu nhấn — rõ là hành động chính; mờ khi chưa chọn gì. */
.cal-overdue__primary:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.cal-overdue__primary:hover:not(:disabled) {
  color: var(--on-accent);
  background: var(--color-primary-focus);
  border-color: var(--color-primary-focus);
}

.cal-overdue__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0 10px 10px;
  padding: 10px 0 0;
  border: none;
  border-top: 1px solid var(--border);
  border-radius: 0;
  flex-shrink: 0;
  background: transparent;
}
</style>
