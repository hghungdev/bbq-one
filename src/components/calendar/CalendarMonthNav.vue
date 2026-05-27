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
  gap: 8px 12px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
  background: var(--bg-secondary);
}

.cal-month-nav__label {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  min-width: 140px;
  text-align: center;
  letter-spacing: -0.02em;
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
