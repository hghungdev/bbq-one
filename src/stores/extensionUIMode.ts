import { defineStore } from 'pinia'
import { ref } from 'vue'
import { BBQ_ICON_QUICK_TRANSLATE_ACTIVE_KEY } from '@/constants/storage'
import {
  loadIconQuickTranslateActive,
  saveIconQuickTranslateActive,
} from '@/services/extension/iconQuickTranslatePref'

/** Đồng bộ hành vi icon extension và tab Dictionary giữa storage / popup */
export const useExtensionUIModeStore = defineStore('extensionUIMode', () => {
  /** true = Active: icon mở Quick Translate, hiện tab Dictionary */
  const iconQuickTranslateActive = ref(false)

  let listenerAttached = false

  function applyFromStorageValue(value: unknown): void {
    iconQuickTranslateActive.value = value === true
  }

  function onStorageChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void {
    if (areaName !== 'local') return
    const c = changes[BBQ_ICON_QUICK_TRANSLATE_ACTIVE_KEY]
    if (c?.newValue !== undefined) {
      applyFromStorageValue(c.newValue)
    }
  }

  async function init(): Promise<void> {
    applyFromStorageValue(await loadIconQuickTranslateActive())
    if (!listenerAttached) {
      chrome.storage.onChanged.addListener(onStorageChanged)
      listenerAttached = true
    }
  }

  async function setIconQuickTranslateActive(active: boolean): Promise<void> {
    await saveIconQuickTranslateActive(active)
    iconQuickTranslateActive.value = active
  }

  return {
    iconQuickTranslateActive,
    init,
    setIconQuickTranslateActive,
  }
})
