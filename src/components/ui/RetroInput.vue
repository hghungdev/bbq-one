<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  id: string
  modelValue: string
  type?: string
  autocomplete?: string
  placeholder?: string
  disabled?: boolean
  /** Giới hạn độ dài — map trực tiếp lên thuộc tính HTML maxlength. */
  maxlength?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputEl = ref<HTMLInputElement | null>(null)

function onInput(e: Event): void {
  const el = e.target as HTMLInputElement
  let v = el.value
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
    @input="onInput"
  />
</template>

<style scoped>
.retro-input {
  width: 100%;
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--input-border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  caret-color: var(--accent);
  transition: border-color 0.1s linear;
}

.retro-input::placeholder {
  color: var(--text-muted);
}

.retro-input:focus,
.retro-input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-color: var(--accent);
}

.retro-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
