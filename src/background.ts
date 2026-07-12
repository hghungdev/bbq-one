import {
  bootstrapBookmarkBaseline,
  scheduleBookmarkAutoBackup,
} from '@/services/bookmarkAutoBackup.service'
import { syncService } from '@/services/sync.service'
import {
  hasPendingSyncWork,
  initAutoSyncOnNetworkRestore,
  runBackgroundAutoSync,
} from '@/services/autoSync.service'
import {
  flushOrphanedPendingDeleteCommits,
  isFlushPendingDeletesMessage,
  PENDING_DELETE_FLUSH_ALARM,
  scheduleOrphanExpiryAlarm,
} from '@/services/pendingDeleteCommit.service'
import { BBQ_AUTH_LOGGED_IN_KEY, BBQ_PENDING_ROUTE_KEY } from '@/constants/storage'
import {
  isRecoverableRefreshTokenAuthError,
  recoverSupabaseAuthFromStaleSession,
} from '@/services/supabaseAuthRecovery.service'
import { OFFSCREEN_CLIPBOARD_LOCK, withWebLock } from '@/utils/webLock'

const ALARM_NAME = 'bbqone-daily-sync'
const AUTOSYNC_RETRY_ALARM = 'bbqone-autosync-retry'

/** Gỡ kho translation/dictionary cũ sau khi update extension. */
const LEGACY_KEYS_TO_REMOVE = [
  'bbqone_local_dictionary',
  'dictionary_cache',
  'translation_settings_cache',
  'bbqone_icon_quick_translate_active',
  'bbqone_use_mymemory',
  'bbqone_anon_translation_settings',
] as const

self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  if (!isRecoverableRefreshTokenAuthError(event.reason)) return
  event.preventDefault()
  void recoverSupabaseAuthFromStaleSession(event.reason)
})

const OPEN_APP_MENU_ID = 'bbq-open-app'

function refreshOpenAppMenuTitle(): void {
  chrome.contextMenus.update(OPEN_APP_MENU_ID, { title: 'Open Dashboard' }, () => {
    void chrome.runtime.lastError
  })
}

function installOpenAppContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: OPEN_APP_MENU_ID,
        title: 'Open Dashboard',
        contexts: ['action'],
      },
      () => {
        void chrome.runtime.lastError
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

function ensureAutoSyncRetryAlarm(): void {
  void chrome.alarms.get(AUTOSYNC_RETRY_ALARM, (a) => {
    if (!a) {
      chrome.alarms.create(AUTOSYNC_RETRY_ALARM, { periodInMinutes: 5 })
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

chrome.runtime.onInstalled.addListener((details) => {
  ensureDailyAlarm()
  ensureAutoSyncRetryAlarm()
  void bootstrapBookmarkBaseline()
  installOpenAppContextMenu()
  if (details.reason === 'install' || details.reason === 'update') {
    void chrome.storage.local.remove([...LEGACY_KEYS_TO_REMOVE])
  }
})

chrome.runtime.onStartup.addListener(() => {
  ensureDailyAlarm()
  ensureAutoSyncRetryAlarm()
  void bootstrapBookmarkBaseline()
  installOpenAppContextMenu()
})

installOpenAppContextMenu()
ensureAutoSyncRetryAlarm()

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[BBQ_AUTH_LOGGED_IN_KEY]) return
  refreshOpenAppMenuTitle()
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== OPEN_APP_MENU_ID) return
  void chrome.storage.local.set({ [BBQ_PENDING_ROUTE_KEY]: '/dashboard' }, () => {
    void chrome.action.openPopup?.().catch?.(() => {})
  })
})

wireBookmarkAutoBackup()
initAutoSyncOnNetworkRestore()
void flushOrphanedPendingDeleteCommits('respect-expiry').then(scheduleOrphanExpiryAlarm)

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PENDING_DELETE_FLUSH_ALARM) {
    void flushOrphanedPendingDeleteCommits('respect-expiry').then(scheduleOrphanExpiryAlarm)
    return
  }
  if (alarm.name === AUTOSYNC_RETRY_ALARM) {
    void (async () => {
      // Chỉ đụng mạng khi thật sự có việc — hasPendingSyncWork đọc local, rẻ.
      if (await hasPendingSyncWork()) await runBackgroundAutoSync('alarm-retry')
    })()
    return
  }
  if (alarm.name !== ALARM_NAME) return
  void syncService.syncFromCache()
})

interface CopyToOsClipboardMessage {
  type: 'copy-to-os-clipboard'
  payload: { text: string }
}

function isCopyToOsClipboardMessage(msg: unknown): msg is CopyToOsClipboardMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const m = msg as Record<string, unknown>
  if (m.type !== 'copy-to-os-clipboard') return false
  const p = m.payload
  if (typeof p !== 'object' || p === null) return false
  return typeof (p as { text?: unknown }).text === 'string'
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  void (async () => {
    try {
      if (isFlushPendingDeletesMessage(msg)) {
        await flushOrphanedPendingDeleteCommits('respect-expiry')
        await scheduleOrphanExpiryAlarm()
        sendResponse({ ok: true })
        return
      }
      if (!isCopyToOsClipboardMessage(msg)) {
        sendResponse({ ok: false, error: 'Unknown message type' })
        return
      }
      const { text } = msg.payload
      const offscreenUrl = chrome.runtime.getURL('offscreen.html')

      const result = await withWebLock(OFFSCREEN_CLIPBOARD_LOCK, async () => {
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
        const r = (await chrome.runtime.sendMessage({
          type: 'offscreen-copy',
          text,
        })) as { ok: boolean; error?: string }
        await chrome.offscreen.closeDocument().catch(() => {})
        return r
      })

      sendResponse(result)
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })()
  return true
})
