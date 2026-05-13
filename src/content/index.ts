// Must run before any module imports `vue` (see popup-host). Avoids Trusted Types CSP violations on strict pages (e.g. LinkedIn).
import './trusted-types-vue-shim'
import { BBQ_ICON_QUICK_TRANSLATE_ACTIVE_KEY } from '@/constants/storage'
import { loadIconQuickTranslateActive } from '@/services/extension/iconQuickTranslatePref'
import { SelectionDetector } from './selection-detector'
import { TriggerIcon } from './trigger-icon'
import { PopupHost } from './popup-host'

async function bootstrapPageQuickTranslateUi(): Promise<void> {
  let iconQuickTranslateActive = await loadIconQuickTranslateActive()

  const detector = new SelectionDetector()
  const icon = new TriggerIcon()
  const popupHost = new PopupHost()

  chrome.storage.onChanged.addListener((changes, area): void => {
    if (area !== 'local') return
    const c = changes[BBQ_ICON_QUICK_TRANSLATE_ACTIVE_KEY]
    if (c === undefined) return
    iconQuickTranslateActive = c.newValue === true
    if (!iconQuickTranslateActive) {
      icon.hide()
      popupHost.hide()
    }
  })

  detector.onSelectionChange((selection) => {
    if (!iconQuickTranslateActive) {
      icon.hide()
      return
    }
    if (!selection || !selection.text.trim()) {
      icon.hide()
      return
    }
    icon.showNear(selection.rect)
    icon.onClick(() => {
      icon.hide()
      popupHost.show({
        text: selection.text,
        rect: selection.rect,
      })
    })
  })
}

// Guard against double-injection (e.g. SPA navigations re-running content scripts)
if (!window.__bbqOneInjected) {
  window.__bbqOneInjected = true
  void bootstrapPageQuickTranslateUi()
}

// Augment Window to track injection state across re-runs
declare global {
  interface Window {
    __bbqOneInjected?: boolean
  }
}
