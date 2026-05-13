import { defineStore } from 'pinia'
import { ref } from 'vue'
import { BBQ_UI_THEME_KEY } from '@/constants/storage'

export type UiChromeTheme = 'light' | 'dark'

function normalize(raw: unknown): UiChromeTheme {
  return raw === 'dark' ? 'dark' : 'light'
}

function applyDom(mode: UiChromeTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = mode
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<UiChromeTheme>('light')
  let storageListenerAttached = false

  async function init(): Promise<void> {
    try {
      const chunk = await chrome.storage.local.get(BBQ_UI_THEME_KEY)
      mode.value = normalize(chunk[BBQ_UI_THEME_KEY])
    } catch {
      mode.value = 'light'
    }
    applyDom(mode.value)

    if (storageListenerAttached) return
    storageListenerAttached = true
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !(BBQ_UI_THEME_KEY in changes)) return
      const nv = changes[BBQ_UI_THEME_KEY]?.newValue
      mode.value = normalize(nv)
      applyDom(mode.value)
    })
  }

  async function set(next: UiChromeTheme): Promise<void> {
    mode.value = next
    applyDom(next)
    try {
      await chrome.storage.local.set({ [BBQ_UI_THEME_KEY]: next })
    } catch {
      /* extension context only */
    }
  }

  async function toggle(): Promise<void> {
    await set(mode.value === 'light' ? 'dark' : 'light')
  }

  return {
    mode,
    init,
    set,
    toggle,
  }
})
