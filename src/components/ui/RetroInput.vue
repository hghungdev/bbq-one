<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  id: string
  modelValue: string
  type?: string
  autocomplete?: string
  placeholder?: string
  disabled?: boolean
  /** Giới hạn độ dài (PIN, v.v.) — map trực tiếp lên thuộc tính HTML maxlength. */
  maxlength?: number
  /** Chỉ chấp nhận chữ số (PIN): chặn phím + lọc paste/input. */
  digitOnly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputEl = ref<HTMLInputElement | null>(null)

const DIGIT_ONLY_ALLOW_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Escape',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
])

function onDigitOnlyKeydown(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (DIGIT_ONLY_ALLOW_KEYS.has(e.key)) return
  if (/^[0-9]$/.test(e.key)) return
  e.preventDefault()
}

function onKeydownWrap(e: KeyboardEvent): void {
  if (!props.digitOnly) return
  onDigitOnlyKeydown(e)
}

function onInput(e: Event): void {
  const el = e.target as HTMLInputElement
  let v = el.value
  if (props.digitOnly) v = v.replace(/\D/g, '')
  const lim = props.maxlength
  if (typeof lim === 'number' && lim > 0) v = v.slice(0, lim)
  emit('update:modelValue', v)
}

defineExpose({
  focus: (): void => {
    inputEl.value?.focus()
  },
})
</script>

<template>
  <input
    ref="inputEl"
    :id="id"
    class="retro-input"
    :type="type ?? 'text'"
    :value="modelValue"
    :autocomplete="autocomplete"
    :placeholder="placeholder"
    :disabled="disabled"
    :maxlength="maxlength"
    :inputmode="digitOnly ? 'numeric' : undefined"
    @keydown="onKeydownWrap"
    @input="onInput"
  />
</template>

<style scoped>
.retro-input {
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border-radius: 0;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  caret-color: var(--accent);
  transition: box-shadow 0.1s linear;
}

.retro-input::placeholder {
  color: var(--text-muted);
}

.retro-input:focus,
.retro-input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-color: var(--border);
  animation: retro-input-caret-line 1s step-end infinite;
}

@keyframes retro-input-caret-line {
  0%,
  49% {
    box-shadow: inset 0 -2px 0 0 var(--accent);
  }
  50%,
  100% {
    box-shadow: inset 0 -2px 0 0 transparent;
  }
}

.retro-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  animation: none;
}
</style>
