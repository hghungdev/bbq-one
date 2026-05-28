<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
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
  <div class="cal-month-nav">
    <RetroButton
      variant="sm"
      type="button"
      class="cal-month-nav__icon-btn"
      :aria-label="t('calendar.nav.prev')"
      @click="emit('prev')"
    >
      ◀
    </RetroButton>
    <span class="cal-month-nav__label" :class="`cal-month-nav__label--${slideDir}`">
      <Transition :name="`cal-month-label-${slideDir}`" mode="out-in">
        <span :key="monthLabel" class="cal-month-nav__label-text">{{ monthLabel }}</span>
      </Transition>
    </span>
    <RetroButton
      variant="sm"
      type="button"
      class="cal-month-nav__icon-btn"
      :aria-label="t('calendar.nav.next')"
      @click="emit('next')"
    >
      ▶
    </RetroButton>
    <RetroButton variant="sm" type="button" class="cal-month-nav__today" @click="emit('today')">
      {{ t('calendar.nav.today') }}
    </RetroButton>
  </div>
</template>

<style scoped>
.cal-month-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 10px 12px 8px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.cal-month-nav__label {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--text-primary);
  min-width: 150px;
  padding: 5px 12px;
  text-align: center;
  letter-spacing: -0.02em;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
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

.cal-month-nav__today {
  margin-left: auto;
  min-width: 100px;
}
</style>
