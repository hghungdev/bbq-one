<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLangStore } from '@/stores/uiLang'

const props = defineProps<{ year: number; month: number }>()

const emit = defineEmits<{
  prev: []
  next: []
  today: []
}>()

const langStore = useLangStore()
const { t } = langStore

const monthLabel = computed(() => {
  const locale = langStore.lang === 'vi' ? 'vi-VN' : 'en-US'
  return new Date(props.year, props.month, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  })
})

// Direction để chọn hướng slide cho title transition theo prev/next.
const slideDir = ref<'next' | 'prev'>('next')
watch(
  () => props.year * 12 + props.month,
  (n, o) => {
    if (n === o) return
    slideDir.value = n > o ? 'next' : 'prev'
  },
)
</script>

<template>
  <!-- U11 (ADN popover): hàng phẳng — tên tháng chữ đậm, ‹ › icon trong suốt, "Hôm nay" nút chữ. -->
  <div class="cal-month-nav">
    <button
      type="button"
      class="ds-icon-action cal-month-nav__icon-btn"
      :aria-label="t('calendar.nav.prev')"
      :title="t('calendar.nav.prev')"
      @click="emit('prev')"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6 6 6" />
      </svg>
    </button>
    <span class="cal-month-nav__label" :class="`cal-month-nav__label--${slideDir}`">
      <Transition :name="`cal-month-label-${slideDir}`" mode="out-in">
        <span :key="monthLabel" class="cal-month-nav__label-text">{{ monthLabel }}</span>
      </Transition>
    </span>
    <button
      type="button"
      class="ds-icon-action cal-month-nav__icon-btn"
      :aria-label="t('calendar.nav.next')"
      :title="t('calendar.nav.next')"
      @click="emit('next')"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6" />
      </svg>
    </button>
    <div class="cal-month-nav__end">
      <!-- U2: CalendarTab đặt ô tìm kiếm (CalendarInlineSearch) vào đây. -->
      <slot name="actions" />
      <button type="button" class="ds-text-action cal-month-nav__today" @click="emit('today')">
        {{ t('calendar.nav.today') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.cal-month-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin: 8px 12px 6px 8px;
  flex: 0 0 auto;
}

.cal-month-nav__label {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 150px;
  padding: 2px 6px;
  text-align: center;
  letter-spacing: -0.02em;
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
}

.cal-month-nav__label-text {
  display: inline-block;
  will-change: transform, opacity;
}

/* Hướng next: title mới trượt từ dưới lên, title cũ trượt lên & mờ. */
.cal-month-label-next-enter-active,
.cal-month-label-next-leave-active,
.cal-month-label-prev-enter-active,
.cal-month-label-prev-leave-active {
  transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 180ms ease;
}

.cal-month-label-next-enter-from {
  transform: translateY(60%);
  opacity: 0;
}
.cal-month-label-next-leave-to {
  transform: translateY(-60%);
  opacity: 0;
}

.cal-month-label-prev-enter-from {
  transform: translateY(-60%);
  opacity: 0;
}
.cal-month-label-prev-leave-to {
  transform: translateY(60%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .cal-month-label-next-enter-active,
  .cal-month-label-next-leave-active,
  .cal-month-label-prev-enter-active,
  .cal-month-label-prev-leave-active {
    transition: opacity 120ms ease;
  }
  .cal-month-label-next-enter-from,
  .cal-month-label-next-leave-to,
  .cal-month-label-prev-enter-from,
  .cal-month-label-prev-leave-to {
    transform: none;
  }
}

.cal-month-nav :deep(.cal-month-nav__icon-btn) {
  min-width: 36px;
  padding-left: 10px;
  padding-right: 10px;
}

.cal-month-nav :deep(.cal-month-nav__today) {
  border-radius: var(--radius-pill);
}

.cal-month-nav__end {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}


</style>
