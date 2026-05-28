<script setup lang="ts">
defineProps<{
  tag: string
  active: boolean
}>()

const emit = defineEmits<{
  select: [tag: string]
}>()
</script>

<template>
  <button
    type="button"
    class="tag-badge"
    :class="{ 'tag-badge--active': active }"
    @click="emit('select', tag)"
  >
    {{ tag }}
  </button>
</template>

<style scoped>
.tag-badge {
  display: inline-flex;
  align-items: center;
  margin: 0 6px 6px 0;
  padding: 4px 9px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-panel) 70%, var(--bg-secondary));
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
  line-height: 1.1;
}

/* Chỉ đổi tông khi chưa chọn — tránh .hover ghi đè .tag-badge--active */
.tag-badge:hover:not(.tag-badge--active) {
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
  color: var(--text-primary);
}

.tag-badge--active {
  border-color: var(--accent);
  color: var(--on-accent);
  background: var(--accent);
  box-shadow: 0 1px 2px var(--panel-ring);
}

.tag-badge--active:hover {
  border-color: var(--accent);
  color: var(--on-accent);
  background: var(--color-primary-focus);
}

.tag-badge:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
