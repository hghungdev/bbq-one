<script setup lang="ts">
import { computed } from 'vue'
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
    <span class="cal-month-nav__label">{{ monthLabel }}</span>
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
