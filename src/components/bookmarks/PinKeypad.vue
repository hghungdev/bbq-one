<script setup lang="ts">
import { ref } from 'vue'

function shuffleArray(arr: string[]): string[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]!
    a[i] = a[j]!
    a[j] = t
  }
  return a
}

const props = withDefaults(
  defineProps<{
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  digit: [d: string]
  backspace: []
}>()

/** 0–9 xáo ngẫu nhiên (kiểu keypad ngân hàng). */
const cells = ref<string[]>(shuffleArray(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']))

function reshuffle(): void {
  cells.value = shuffleArray(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
}

defineExpose({ reshuffle })
</script>

<template>
  <div
    class="pin-keypad"
    role="group"
    aria-label="Bàn phím số"
  >
    <div class="pin-keypad__grid">
      <button
        v-for="(d, idx) in cells.slice(0, 9)"
        :key="`k-${idx}-${d}`"
        type="button"
        class="pin-keypad__btn"
        :disabled="props.disabled"
        :aria-label="`Số ${d}`"
        @click="emit('digit', d)"
      >
        {{ d }}
      </button>
    </div>
    <div class="pin-keypad__bottom">
      <span class="pin-keypad__spacer" aria-hidden="true" />
      <button
        type="button"
        class="pin-keypad__btn"
        :disabled="props.disabled"
        :aria-label="`Số ${cells[9]}`"
        @click="emit('digit', cells[9]!)"
      >
        {{ cells[9] }}
      </button>
      <button
        type="button"
        class="pin-keypad__btn pin-keypad__btn--del"
        :disabled="props.disabled"
        aria-label="Xóa một ký tự"
        @click="emit('backspace')"
      >
        ⌫
      </button>
    </div>
  </div>
</template>

<style scoped>
.pin-keypad {
  margin-top: 10px;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.pin-keypad__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.pin-keypad__bottom {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.pin-keypad__spacer {
  pointer-events: none;
}

.pin-keypad__btn {
  min-height: 44px;
  padding: 8px 4px;
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-lg);
  letter-spacing: 0.04em;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--bg-panel);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.1s, color 0.1s;
}

.pin-keypad__btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.pin-keypad__btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.pin-keypad__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pin-keypad__btn--del {
  font-size: var(--font-size-sm);
  color: var(--danger);
  border-color: var(--border);
}

.pin-keypad__btn--del:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
