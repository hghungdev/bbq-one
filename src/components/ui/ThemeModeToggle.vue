<script setup lang="ts">
  import { storeToRefs } from 'pinia'
  import { useThemeStore } from '@/stores/theme'
  import type { UiChromeTheme } from '@/stores/theme'
  import { useLangStore } from '@/stores/uiLang'

  const theme = useThemeStore()
  const { mode } = storeToRefs(theme)
  const { t } = useLangStore()

  function pick(next: UiChromeTheme): void {
    void theme.set(next)
  }
</script>

<template>
  <div class="theme-mode" role="group" :aria-label="t('theme.ariaGroup')">
    <div class="theme-mode__seg" role="radiogroup" :aria-label="t('theme.segAria')">
      <button
        type="button"
        class="theme-mode__btn"
        :class="{ 'theme-mode__btn--on': mode === 'light' }"
        role="radio"
        :aria-checked="mode === 'light'"
        :aria-label="t('theme.lightAria')"
        :title="t('theme.lightTitle')"
        @click="pick('light')"
      >
        <svg class="theme-mode__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.75" />
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
      </button>
      <button
        type="button"
        class="theme-mode__btn"
        :class="{ 'theme-mode__btn--on': mode === 'dark' }"
        role="radio"
        :aria-checked="mode === 'dark'"
        :aria-label="t('theme.darkAria')"
        :title="t('theme.darkTitle')"
        @click="pick('dark')"
      >
        <svg class="theme-mode__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21 14.462A9 9 0 1 1 9.538 3a7 7 0 0 0 11.462 11.462Z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
  .theme-mode {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    min-width: 0;
    max-width: 140px;
  }

  .theme-mode__caption {
    font-size: 9px;
    line-height: 1.25;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    text-transform: uppercase;
    text-align: center;
  }

  .theme-mode__seg {
    display: inline-flex;
    padding: 2px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    gap: 2px;
  }

  .theme-mode__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 28px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 0.12s linear,
      color 0.12s linear,
      border-color 0.12s linear;
  }

  .theme-mode__btn:hover {
    color: var(--accent);
  }

  .theme-mode__btn--on {
    background: var(--surface-accent-muted);
    color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-soft-border);
  }

  .theme-mode__btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .theme-mode__icon {
    width: 17px;
    height: 17px;
    display: block;
  }
</style>
