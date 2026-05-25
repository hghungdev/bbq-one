<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import IconButton from '@/components/ui/IconButton.vue'
import { useThemeStore } from '@/stores/theme'
import { useLangStore } from '@/stores/uiLang'

const theme = useThemeStore()
const { mode } = storeToRefs(theme)
const { t } = useLangStore()

const toggleLabel = computed(() =>
  mode.value === 'light' ? t('theme.switchToDark') : t('theme.switchToLight'),
)

function onToggle(): void {
  void theme.toggle()
}
</script>

<template>
  <IconButton
    class="theme-mode-toggle"
    variant="default"
    :label="toggleLabel"
    :title="toggleLabel"
    @click="onToggle"
  >
    <svg
      v-if="mode === 'light'"
      class="theme-mode-toggle__icon"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.75" />
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      />
    </svg>
    <svg
      v-else
      class="theme-mode-toggle__icon"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M21 14.462A9 9 0 1 1 9.538 3a7 7 0 0 0 11.462 11.462Z"
      />
    </svg>
  </IconButton>
</template>

<style scoped>
.theme-mode-toggle {
  flex-shrink: 0;
}

.theme-mode-toggle__icon {
  display: block;
}
</style>
