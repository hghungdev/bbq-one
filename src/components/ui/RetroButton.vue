<script setup lang="ts">
defineProps<{
  type?: 'button' | 'submit'
  disabled?: boolean
  variant?: 'default' | 'sm'
}>()
</script>

<template>
  <button
    class="retro-btn"
    :class="{ 'retro-btn--sm': (variant ?? 'default') === 'sm' }"
    :type="type ?? 'button'"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.retro-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
  letter-spacing: -0.022em;
  transition:
    transform 0.08s ease,
    border-color 0.08s ease,
    color 0.08s ease;
}

.retro-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--color-primary-focus);
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

.retro-btn--sm {
  min-width: auto;
  padding: 6px 14px;
  font-size: var(--font-size-sm);
}
</style>
