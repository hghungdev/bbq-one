<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import { useSettingsStore, type FontSizePx } from '@/stores/settings'

const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()

const sizes: FontSizePx[] = [11, 13, 15]

function pick(px: FontSizePx): void {
  void settings.setFontSize(px)
}

function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true)
})
</script>

<template>
  <div
    class="settings-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
  >
    <div class="settings-backdrop" @click="emit('close')" />
    <div class="settings-panel crt-scanlines">
      <h2 id="settings-title" class="settings-title">
        SETTINGS
      </h2>
      <p class="settings-label">
        FONT SIZE (PX)
      </p>
      <div class="settings-row">
        <RetroButton
          v-for="px in sizes"
          :key="px"
          variant="sm"
          type="button"
          :disabled="settings.fontSizePx === px"
          @click="pick(px)"
        >
          [ {{ px }} ]
        </RetroButton>
      </div>
      <RetroButton type="button" class="settings-close" @click="emit('close')">
        [ CLOSE ]
      </RetroButton>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.settings-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(13, 13, 6, 0.75);
}

.settings-panel {
  position: relative;
  z-index: 1;
  min-width: 280px;
  max-width: 100%;
  padding: 16px 18px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  box-shadow: 0 0 0 1px var(--accent);
}

.settings-title {
  margin: 0 0 12px;
  font-size: var(--font-size-lg);
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.settings-label {
  margin: 0 0 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.settings-close {
  width: 100%;
}
</style>
