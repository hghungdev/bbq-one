<script setup lang="ts">
defineProps<{
  type?: 'button' | 'submit'
  /** Accessible name (maps to aria-label on the button). */
  label: string
  title?: string
  variant?: 'default' | 'danger' | 'accent'
  disabled?: boolean
}>()
</script>

<template>
  <button
    class="icon-btn"
    :class="`icon-btn--${variant ?? 'default'}`"
    :type="type ?? 'button'"
    :aria-label="label"
    :title="title ?? label"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
/* U11 (ADN popover): icon trong suốt, hover tô nhạt — nhóm icon trên header đã có khung pill bao
   ngoài, hộp thoại không cần vòng viền riêng cho nút ✕. */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.12s linear,
    color 0.12s linear;
}

.icon-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-primary) 7%, transparent);
}

.icon-btn--accent {
  color: var(--accent);
  background: var(--surface-accent-muted);
}

.icon-btn--accent:hover:not(:disabled) {
  color: var(--accent);
  background: var(--accent-soft-bg-hover);
}

.icon-btn--danger {
  color: var(--text-muted);
}

.icon-btn--danger:hover:not(:disabled) {
  color: var(--danger);
  background: var(--surface-danger-muted);
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.icon-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.icon-btn :deep(svg) {
  display: block;
}
</style>
