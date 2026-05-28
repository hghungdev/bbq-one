<script setup lang="ts">
defineProps<{
  title: string
  disabled?: boolean
}>()
</script>

<template>
  <button
    type="button"
    class="icon-rst"
    :title="title"
    :aria-label="title"
    :disabled="disabled"
  >
    <svg
      class="icon-rst__svg"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        class="icon-rst__stroke"
        d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
      />
    </svg>
  </button>
</template>

<style scoped>
.icon-rst {
  box-sizing: border-box;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}

.icon-rst:hover:not(:disabled) {
  border-color: var(--accent-soft-border);
  color: var(--accent);
  background: var(--surface-accent-muted);
}

.icon-rst:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.icon-rst:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.icon-rst__svg {
  width: 15px;
  height: 15px;
  display: block;
}

.icon-rst__stroke {
  stroke: currentColor;
  stroke-width: 1.85;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}
</style>
