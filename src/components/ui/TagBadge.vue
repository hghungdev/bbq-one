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
    [ {{ tag }} ]
  </button>
</template>

<style scoped>
.tag-badge {
  display: inline-flex;
  align-items: center;
  margin: 0 4px 4px 0;
  padding: 2px 6px;
  border-radius: 0;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.tag-badge:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.tag-badge--active {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
