<script setup lang="ts">
defineProps<{
  type?: 'button' | 'submit'
  disabled?: boolean
  variant?: 'default' | 'sm'
  /** U11: hành động chính của hộp thoại — nút đặc màu nhấn. */
  primary?: boolean
}>()
</script>

<template>
  <button
    class="retro-btn"
    :class="{ 'retro-btn--sm': (variant ?? 'default') === 'sm', 'retro-btn--primary': primary }"
    :type="type ?? 'button'"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
/* U11 (ADN popover): nút phụ phẳng — nền xám nhạt, không viền, chữ màu nhấn, bo tròn. Hành động
   chính dùng .ds-primary (ds.css). */
.retro-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 96px;
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  transition:
    transform 0.08s ease,
    background 0.12s linear,
    color 0.12s linear;
}

.retro-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.retro-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.retro-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.retro-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.retro-btn--primary {
  background: var(--accent);
  color: var(--on-accent);
}

.retro-btn--primary:hover:not(:disabled) {
  background: var(--color-primary-focus);
  color: var(--on-accent);
}

.retro-btn--sm {
  min-width: auto;
  padding: 6px 14px;
}
</style>
