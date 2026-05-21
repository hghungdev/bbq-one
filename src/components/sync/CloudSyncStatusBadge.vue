<script setup lang="ts">
/** Trạng thái đồng bộ cloud — icon stroke đồng bộ với ThemeModeToggle; click để sync. */
export type CloudSyncVariant = 'idle' | 'done' | 'syncing' | 'unsaved' | 'error'

defineProps<{
  variant: CloudSyncVariant
  /** Tooltip + aria-label (chuỗi đầy đủ từ i18n). */
  label: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    class="cloud-sync-badge"
    :class="[
      `cloud-sync-badge--${variant}`,
      { 'cloud-sync-badge--disabled': disabled },
    ]"
    :disabled="disabled"
    :aria-label="label"
    :aria-busy="variant === 'syncing'"
    :title="label"
    @click="emit('click')"
  >
    <svg
      class="cloud-sync-badge__icon"
      :class="{ 'cloud-sync-badge__icon--spin': variant === 'syncing' }"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
      focusable="false"
    >
      <!-- idle / done / unsaved: cloud -->
      <path
        v-if="variant === 'idle' || variant === 'done' || variant === 'unsaved'"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M17.5 19H9a7 7 0 1 1 6.71-9.5A5 5 0 0 1 17.5 19Z"
      />
      <path
        v-if="variant === 'done'"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m9 14 2 2 4-4"
      />
      <template v-if="variant === 'unsaved'">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          d="M12 9v4"
        />
        <circle cx="12" cy="17" r="0.75" fill="currentColor" />
      </template>

      <!-- syncing: circular arrows -->
      <template v-if="variant === 'syncing'">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        />
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
        />
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M21 21v-5h-5"
        />
      </template>

      <!-- error: cloud-off -->
      <template v-if="variant === 'error'">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M17.5 19H9a7 7 0 1 1 6.71-9.5A5 5 0 0 1 17.5 19Z"
        />
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m2 2 20 20"
        />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.cloud-sync-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 28px;
  padding: 0;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--bg-secondary);
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background 0.12s linear,
    color 0.12s linear,
    border-color 0.12s linear;
}

.cloud-sync-badge:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent-soft-border);
}

.cloud-sync-badge:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.cloud-sync-badge:disabled,
.cloud-sync-badge--disabled {
  cursor: not-allowed;
  opacity: 0.92;
}

.cloud-sync-badge:disabled:hover {
  color: inherit;
  border-color: inherit;
}

.cloud-sync-badge--idle {
  color: var(--text-muted);
  border-color: var(--border);
}

.cloud-sync-badge--done {
  color: var(--sync-done);
  border-color: var(--sync-done-muted);
  background: var(--surface-success-muted);
}

.cloud-sync-badge--syncing {
  color: var(--accent);
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
}

.cloud-sync-badge--unsaved {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--surface-danger-muted);
}

.cloud-sync-badge--error {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--surface-danger-muted);
}

.cloud-sync-badge__icon {
  display: block;
}

.cloud-sync-badge__icon--spin {
  animation: cloud-sync-spin 1s linear infinite;
}

@keyframes cloud-sync-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
