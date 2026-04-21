<script setup lang="ts">
defineProps<{
  title: string
  disabled?: boolean
}>()
</script>

<template>
  <button
    type="button"
    class="icon-del"
    :title="title"
    :aria-label="title"
    :disabled="disabled"
  >
    <svg
      class="icon-del__svg"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        class="icon-del__stroke"
        points="3 6 5 6 21 6"
      />
      <path
        class="icon-del__stroke"
        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
      />
      <line class="icon-del__stroke" x1="10" y1="11" x2="10" y2="17" />
      <line class="icon-del__stroke" x1="14" y1="11" x2="14" y2="17" />
    </svg>
  </button>
</template>

<style scoped>
.icon-del {
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
  border-radius: 0;
  background: transparent;
  color: var(--danger);
  cursor: pointer;
}

.icon-del:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, var(--bg-secondary));
}

.icon-del:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.icon-del:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.icon-del__svg {
  width: 15px;
  height: 15px;
  display: block;
}

.icon-del__stroke {
  stroke: currentColor;
  stroke-width: 1.85;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
