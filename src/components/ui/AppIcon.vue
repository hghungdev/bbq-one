<script setup lang="ts">
import { computed } from 'vue'
import { APP_ICONS, type AppIconName } from './icons'

/**
 * U15: icon dùng chung — nét đều cho mọi icon; icon nhỏ (≤ 14 px) nét 2 cho khỏi mảnh.
 * Chỉ để trang trí (aria-hidden): tên đọc cho trình đọc màn hình nằm ở nút chứa nó (aria-label).
 */
const props = withDefaults(defineProps<{ name: AppIconName; size?: number }>(), { size: 16 })

const paths = computed(() => APP_ICONS[props.name])
const strokeWidth = computed(() => (props.size <= 14 ? 2 : 1.75))
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex: 0 0 auto;
}
</style>
