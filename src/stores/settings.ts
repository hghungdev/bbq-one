import { defineStore } from 'pinia'
import { ref } from 'vue'

const FONT_KEY = 'bbqone_font_size'

export type FontSizePx = 11 | 13 | 15

export const useSettingsStore = defineStore('settings', () => {
  const fontSizePx = ref<FontSizePx>(13)

  function applyToDocument(): void {
    const px = fontSizePx.value
    document.documentElement.style.setProperty('--font-size-base', `${px}px`)
    document.documentElement.style.setProperty(
      '--font-size-sm',
      `${Math.max(11, px - 2)}px`,
    )
    document.documentElement.style.setProperty('--font-size-lg', `${px + 2}px`)
  }

  async function load(): Promise<void> {
    const { [FONT_KEY]: v } = await chrome.storage.local.get(FONT_KEY)
    if (v === 11 || v === 13 || v === 15) {
      fontSizePx.value = v
    }
    applyToDocument()
  }

  async function setFontSize(px: FontSizePx): Promise<void> {
    fontSizePx.value = px
    await chrome.storage.local.set({ [FONT_KEY]: px })
    applyToDocument()
  }

  return { fontSizePx, load, setFontSize, applyToDocument }
})
