<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  message: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

const panelRef = ref<HTMLElement | null>(null)

function dismiss(): void {
  emit('update:open', false)
  emit('cancel')
}

function confirm(): void {
  emit('update:open', false)
  emit('confirm')
}

function onKeydown(e: KeyboardEvent): void {
  if (!props.open) return
  if (e.key === 'y' || e.key === 'Y') {
    e.preventDefault()
    confirm()
  } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
    e.preventDefault()
    dismiss()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      queueMicrotask(() => panelRef.value?.focus())
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="retro-confirm__backdrop"
      role="presentation"
      @click.self="dismiss"
    >
      <div
        ref="panelRef"
        class="retro-confirm"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @keydown.stop
      >
        <p class="retro-confirm__msg">
          {{ message }}
        </p>
        <p class="retro-confirm__prompt">
          [Y/N]: <span class="retro-prompt-cursor" aria-hidden="true">_</span>
        </p>
        <div class="retro-confirm__actions">
          <button type="button" class="retro-confirm__btn" @click="confirm">
            [ Y ]
          </button>
          <button type="button" class="retro-confirm__btn" @click="dismiss">
            [ N ]
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.retro-confirm__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 13, 6, 0.85);
  padding: 16px;
}

.retro-confirm {
  width: 100%;
  max-width: 320px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  padding: 16px 14px 14px;
  outline: none;
}

.retro-confirm__msg {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  white-space: pre-wrap;
}

.retro-confirm__prompt {
  margin: 0 0 14px;
  font-size: var(--font-size-sm);
  color: var(--accent);
}

.retro-confirm__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.retro-confirm__btn {
  font-family: inherit;
  font-size: var(--font-size-sm);
  padding: 6px 12px;
  border-radius: 0;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--accent);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.retro-confirm__btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}
</style>
