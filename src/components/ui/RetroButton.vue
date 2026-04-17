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
  padding: 8px 16px;
  border-radius: 0;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--accent);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.retro-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-primary);
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
  padding: 4px 8px;
  font-size: var(--font-size-sm);
}
</style>
