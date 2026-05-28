<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { highlightCode } from '@/utils/highlight'
import { useThemeStore } from '@/stores/theme'

const props = defineProps<{
  code: string
  language: string
}>()

const html = ref<string>('')

const { mode: themeMode } = storeToRefs(useThemeStore())

async function render(): Promise<void> {
  html.value = await highlightCode(props.code, props.language || 'plaintext')
}

onMounted(() => {
  void render()
})

watch(
  () => [props.code, props.language, themeMode.value] as const,
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
  border-radius: var(--radius-md);
  background: var(--bg-code);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 8%, transparent);
}

.code-block :deep(.shiki) {
  margin: 0;
  padding: 8px 10px;
  background: var(--bg-code) !important;
  border-radius: var(--radius-md);
  font-family: var(--font-mono, inherit);
  font-size: var(--font-size-sm);
}

/* Vintage tint over default Shiki theme */
.retro-shiki :deep(.shiki) {
  filter: saturate(0.65) contrast(1.05);
}
</style>
