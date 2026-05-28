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
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.12s linear,
    color 0.12s linear,
    border-color 0.12s linear;
}

.icon-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
}

.icon-btn--accent {
  color: var(--accent);
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.icon-btn--accent:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-soft-bg-hover);
}

.icon-btn--danger {
  color: var(--text-muted);
}

.icon-btn--danger:hover:not(:disabled) {
  color: var(--danger);
  border-color: var(--danger);
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
