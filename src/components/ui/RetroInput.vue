<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  id: string
  modelValue: string
  type?: string
  autocomplete?: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputEl = ref<HTMLInputElement | null>(null)

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
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
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
