<script setup lang="ts">
import { ref } from 'vue'
import RetroInput from '@/components/ui/RetroInput.vue'

const props = defineProps<{
  modelValue: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const draft = ref('')

function commitTag(): void {
  const t = draft.value.trim().toLowerCase().replace(/\s+/g, '-')
  if (!t) return
  if (props.modelValue.includes(t)) {
    draft.value = ''
    return
  }
  emit('update:modelValue', [...props.modelValue, t])
  draft.value = ''
}

function removeTag(tag: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((x) => x !== tag),
  )
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitTag()
  }
}
</script>

<template>
  <div class="tag-input">
    <div class="tag-input__chips">
      <span
        v-for="t in modelValue"
        :key="t"
        class="tag-input__chip"
      >
        {{ t }}
        <button
          type="button"
          class="tag-input__x"
          :aria-label="`remove ${t}`"
          @click="removeTag(t)"
        >
          ×
        </button>
      </span>
    </div>
    <RetroInput
      id="tag-input-draft"
      v-model="draft"
      placeholder="tag_"
      autocomplete="off"
      @keydown="onKeydown"
    />
  </div>
</template>

<style scoped>
.tag-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-input__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-input__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.tag-input__x {
  margin: 0;
  padding: 0 2px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-sm);
  line-height: 1;
}

.tag-input__x:hover {
  color: var(--text-primary);
}

.tag-input__x:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
