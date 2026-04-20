import {
  bootstrapBookmarkBaseline,
  scheduleBookmarkAutoBackup,
} from '@/services/bookmarkAutoBackup.service'
import { syncService } from '@/services/sync.service'
import { dictionaryEntriesService } from '@/services/dictionary/entries.service'
import { translationSettingsService } from '@/services/dictionary/settings.service'
import { BBQ_AUTH_LOGGED_IN_KEY, BBQ_PENDING_ROUTE_KEY } from '@/constants/storage'
import type { DictMessage } from '@/types/dictionary'

const ALARM_NAME = 'bbqone-daily-sync'
const OPEN_APP_MENU_ID = 'bbq-open-app'

function refreshOpenAppMenuTitle(): void {
  void chrome.storage.local.get(BBQ_AUTH_LOGGED_IN_KEY, (data) => {
    const loggedIn = !!data[BBQ_AUTH_LOGGED_IN_KEY]
    const title = loggedIn ? 'Open Dashboard' : 'Login'
    chrome.contextMenus.update(OPEN_APP_MENU_ID, { title }, () => {
      void chrome.runtime.lastError
    })
  })
}

function installOpenAppContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: OPEN_APP_MENU_ID,
        title: 'Login',
        contexts: ['action'],
      },
      () => {
        void chrome.runtime.lastError
        refreshOpenAppMenuTitle()
      },
    )
  })
}

function ensureDailyAlarm(): void {
  void chrome.alarms.get(ALARM_NAME, (a) => {
    if (!a) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 24 * 60 })
    }
  })
}

function wireBookmarkAutoBackup(): void {
  const onChange = (): void => {
    scheduleBookmarkAutoBackup()
  }
  chrome.bookmarks.onCreated.addListener(onChange)
  chrome.bookmarks.onRemoved.addListener(onChange)
  chrome.bookmarks.onChanged.addListener(onChange)
  chrome.bookmarks.onMoved.addListener(onChange)
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDailyAlarm()
  void bootstrapBookmarkBaseline()
  installOpenAppContextMenu()
})

chrome.runtime.onStartup.addListener(() => {
  ensureDailyAlarm()
  void bootstrapBookmarkBaseline()
  installOpenAppContextMenu()
})

installOpenAppContextMenu()

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[BBQ_AUTH_LOGGED_IN_KEY]) return
  refreshOpenAppMenuTitle()
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== OPEN_APP_MENU_ID) return
  void chrome.storage.local.get(BBQ_AUTH_LOGGED_IN_KEY, (data) => {
    const loggedIn = !!data[BBQ_AUTH_LOGGED_IN_KEY]
    const path = loggedIn ? '/dashboard' : '/login'
    void chrome.storage.local.set({ [BBQ_PENDING_ROUTE_KEY]: path }, () => {
      void chrome.action.openPopup?.().catch?.(() => {})
    })
  })
})

wireBookmarkAutoBackup()

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return
  void syncService.syncFromCache()
})

// ── Dictionary message handlers (content script ↔ background ↔ Supabase) ──
chrome.runtime.onMessage.addListener((msg: DictMessage, _sender, sendResponse) => {
  void (async () => {
    try {
      switch (msg.type) {
        case 'get-settings': {
          const s = await translationSettingsService.getOrCreate()
          sendResponse(s)
          break
        }
        case 'save-entry': {
          const entry = await dictionaryEntriesService.upsert(msg.payload)
          sendResponse({ ok: true, entry })
          break
        }
        case 'entry-exists': {
          const r = await dictionaryEntriesService.exists(
            msg.payload.source_text,
            msg.payload.source_lang,
            msg.payload.target_lang,
          )
          sendResponse(r)
          break
        }
        case 'copy-to-os-clipboard': {
          const { text } = msg.payload
          const offscreenUrl = chrome.runtime.getURL('offscreen.html')

          // Đảm bảo offscreen document tồn tại
          const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
            documentUrls: [offscreenUrl],
          })
          if (existingContexts.length === 0) {
            await chrome.offscreen.createDocument({
              url: offscreenUrl,
              reasons: ['CLIPBOARD' as chrome.offscreen.Reason],
              justification: 'Write text to OS clipboard from extension popup.',
            })
          }

          // Gửi text sang offscreen và chờ kết quả trả về
          const result = await chrome.runtime.sendMessage({
            type: 'offscreen-copy',
            text,
          }) as { ok: boolean; error?: string }

          // Đóng offscreen sau khi xong
          void chrome.offscreen.closeDocument().catch(() => {})

          sendResponse(result)
          break
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' })
      }
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })()
  // Return true to keep the message channel open for async sendResponse
  return true
})
