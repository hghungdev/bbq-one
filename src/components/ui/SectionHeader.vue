<script setup lang="ts">
/**
 * U11: tiêu đề mục theo "ADN popover" — `● NHÃN · phần phụ` bên trái, hành động (nút chữ / icon) bên
 * phải. Không khung, không viền.
 */
defineProps<{
  label: string
  /** Phần phụ chữ thường, mờ: tên folder, số lượng, ngày… */
  meta?: string
  /** Chấm màu trước nhãn (vd lịch hôm nay / ngày mai). */
  tone?: 'today' | 'tomorrow' | 'accent'
}>()
</script>

<template>
  <div class="section-head">
    <span v-if="tone" class="section-head__dot" :class="`section-head__dot--${tone}`" aria-hidden="true" />
    <h3 class="section-head__label ds-label">
      {{ label }}<span v-if="meta" class="ds-label__meta"> · {{ meta }}</span>
    </h3>
    <div class="section-head__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 4px 0 10px;
}

.section-head__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.section-head__dot--today {
  background: var(--calendar-banner-today-border);
}

.section-head__dot--tomorrow {
  background: var(--calendar-banner-upcoming-border);
}

.section-head__dot--accent {
  background: var(--accent);
}

.section-head__label {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-head__actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.section-head__actions:empty {
  display: none;
}
</style>
