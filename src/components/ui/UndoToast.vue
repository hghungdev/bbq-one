<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import { useUndoToastStore } from '@/stores/undoToast'
import { useLangStore } from '@/stores/uiLang'

const undoToast = useUndoToastStore()
const { t } = useLangStore()
const now = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval> | null = null

function stopCountdown(): void {
  if (countdownTimer === null) return
  clearInterval(countdownTimer)
  countdownTimer = null
}

function startCountdown(): void {
  stopCountdown()
  now.value = Date.now()
  countdownTimer = setInterval(() => {
    now.value = Date.now()
  }, 250)
}

watch(
  () => undoToast.visible,
  (visible) => {
    if (visible) {
      startCountdown()
      return
    }
    stopCountdown()
  },
)

onUnmounted(stopCountdown)

function remainingSeconds(expiresAt: number): number {
  if (expiresAt <= 0) return 0
  return Math.max(1, Math.ceil((expiresAt - now.value) / 1_000))
}
</script>

<template>
  <div
    v-if="undoToast.visible"
    class="undo-toast-stack"
    aria-live="polite"
    aria-atomic="false"
  >
    <TransitionGroup
      name="undo-toast"
      tag="div"
      class="undo-toast-stack__items"
    >
      <div
        v-for="item in undoToast.items"
        :key="item.id"
        class="undo-toast"
        role="status"
      >
        <span class="undo-toast__message">{{ item.message }}</span>
        <span class="undo-toast__countdown" aria-hidden="true">
          {{ remainingSeconds(item.expiresAt) }}
        </span>
        <RetroButton
          variant="sm"
          type="button"
          class="undo-toast__action"
          @click="undoToast.undo(item.id)"
        >
          {{ t('undo.action') }}
        </RetroButton>
        <IconButton
          variant="default"
          :label="t('common.close')"
          @click="undoToast.dismiss(item.id)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              d="M6 6l12 12M18 6L6 18"
            />
          </svg>
        </IconButton>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.undo-toast-stack {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 10020;
  width: min(360px, calc(100vw - 32px));
  pointer-events: none;
}

.undo-toast-stack__items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.undo-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--accent) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  box-shadow: 0 18px 54px var(--panel-ring);
  pointer-events: auto;
}

.undo-toast__message {
  flex: 1 1 auto;
  min-width: 0;
  padding-left: 4px;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: 1.35;
}

.undo-toast__action {
  flex: 0 0 auto;
}

.undo-toast__countdown {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--surface-accent-muted) 62%, var(--bg-panel));
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 40%, transparent);
}

.undo-toast-enter-active,
.undo-toast-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.undo-toast-enter-from,
.undo-toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
