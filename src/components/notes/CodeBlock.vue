<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { highlightCode } from '@/utils/highlight'

const props = defineProps<{
  code: string
  language: string
}>()

const html = ref<string>('')

async function render(): Promise<void> {
  html.value = await highlightCode(props.code, props.language || 'plaintext')
}

onMounted(() => {
  void render()
})

watch(
  () => [props.code, props.language] as const,
  () => {
    void render()
  },
)
</script>

<template>
  <div class="code-block retro-shiki" v-html="html" />
</template>

<style scoped>
.code-block {
  margin: 0 0 10px;
  overflow-x: auto;
  border: 1px solid var(--border);
  background: var(--bg-code);
}

.code-block :deep(.shiki) {
  margin: 0;
  padding: 8px 10px;
  background: var(--bg-code) !important;
  font-family: var(--font-mono, inherit);
  font-size: var(--font-size-sm);
}

/* Vintage tint over default Shiki theme */
.retro-shiki :deep(.shiki) {
  filter: saturate(0.65) contrast(1.05);
}
</style>
