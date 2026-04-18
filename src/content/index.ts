import { SelectionDetector } from './selection-detector'
import { TriggerIcon } from './trigger-icon'
import { PopupHost } from './popup-host'

// Guard against double-injection (e.g. SPA navigations re-running content scripts)
if (!window.__bbqOneInjected) {
  window.__bbqOneInjected = true

  const detector = new SelectionDetector()
  const icon = new TriggerIcon()
  const popupHost = new PopupHost()

  detector.onSelectionChange((selection) => {
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

// Augment Window to track injection state across re-runs
declare global {
  interface Window {
    __bbqOneInjected?: boolean
  }
}
