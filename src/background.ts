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
import {
  BBQ_AUTH_LOGGED_IN_KEY,
  BBQ_OMNIBOX_MODE_KEY,
  BBQ_PENDING_ROUTE_KEY,
  FOLDERS_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  NOTES_CACHE_KEY,
  UI_LANG_KEY,
} from '@/constants/storage'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type { Folder, Note, NoteBody } from '@/types'
import { en } from '@/i18n/en'
import { vi } from '@/i18n/vi'
import {
  noteCopyText,
  omniboxContent,
  omniboxDescription,
  omniboxNoteRoute,
  omniboxSearchRoute,
  parseOmniboxMode,
  resolveOmniboxNoteId,
  searchNotesForOmnibox,
  type OmniboxMode,
} from '@/utils/omniboxNotes'
import {
  isRecoverableRefreshTokenAuthError,
  recoverSupabaseAuthFromStaleSession,
} from '@/services/supabaseAuthRecovery.service'
import { OFFSCREEN_CLIPBOARD_LOCK, withWebLock } from '@/utils/webLock'
import {
  ACCOUNT_AUTOLOCK_ALARM,
  purgeExpiredSessionDek,
  resolveAccountForPush,
} from '@/utils/accountSession'

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
  if (alarm.name === ACCOUNT_AUTOLOCK_ALARM) {
    // S2C1.3: DEK account hết hạn → xóa khỏi chrome.storage.session; popup/tab đang mở tự khóa.
    void purgeExpiredSessionDek()
    return
  }
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
  void syncService.syncFromCache(resolveAccountForPush)
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

/** Ghi chữ vào clipboard hệ điều hành qua offscreen document (execCommand) — nút ⧉ (fallback) + thanh địa chỉ (F1). */
async function copyViaOffscreen(text: string): Promise<{ ok: boolean; error?: string }> {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html')
  return withWebLock(OFFSCREEN_CLIPBOARD_LOCK, async () => {
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
      sendResponse(await copyViaOffscreen(msg.payload.text))
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })()
  return true
})

// ─── F1: tìm ghi chú từ thanh địa chỉ (`bbq …`) — Enter mở, Alt+Enter sao chép cả ghi chú ─────────────────────

interface OmniboxData {
  notes: Note[]
  bodies: NoteBody[]
  folders: Folder[]
  lang: 'en' | 'vi'
  /** S12: chế độ gợi ý (Cài đặt › Tìm từ thanh địa chỉ). */
  mode: OmniboxMode
}

/** Cache trước (có cả khi đăng nhập), thiếu thì kho máy — không gọi mạng. */
const OMNIBOX_KEYS: string[] = [
  NOTES_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  FOLDERS_CACHE_KEY,
  LOCAL_STORAGE_KEYS.notes,
  LOCAL_STORAGE_KEYS.noteBodies,
  LOCAL_STORAGE_KEYS.folders,
  UI_LANG_KEY,
  BBQ_OMNIBOX_MODE_KEY,
]
let omniboxData: Promise<OmniboxData> | null = null

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some((k) => OMNIBOX_KEYS.includes(k))) omniboxData = null
})

function loadOmniboxData(): Promise<OmniboxData> {
  if (omniboxData) return omniboxData
  const loading = (async (): Promise<OmniboxData> => {
    const r = await chrome.storage.local.get(OMNIBOX_KEYS)
    const pick = <T>(cached: unknown, local: unknown): T[] =>
      (Array.isArray(cached) ? cached : Array.isArray(local) ? local : []) as T[]
    return {
      notes: pick<Note>(r[NOTES_CACHE_KEY], r[LOCAL_STORAGE_KEYS.notes]),
      bodies: pick<NoteBody>(r[NOTE_BODIES_CACHE_KEY], r[LOCAL_STORAGE_KEYS.noteBodies]),
      folders: pick<Folder>(r[FOLDERS_CACHE_KEY], r[LOCAL_STORAGE_KEYS.folders]),
      lang: r[UI_LANG_KEY] === 'vi' ? 'vi' : 'en',
      mode: parseOmniboxMode(r[BBQ_OMNIBOX_MODE_KEY]),
    }
  })()
  omniboxData = loading
  // Đọc lỗi → lần gõ sau đọc lại (không kẹt Promise reject).
  loading.catch(() => {
    if (omniboxData === loading) omniboxData = null
  })
  return loading
}

function omniboxText(
  lang: OmniboxData['lang'],
  key: 'omnibox.default' | 'omnibox.noResults' | 'omnibox.off' | 'notes.untitled',
): string {
  return (lang === 'vi' ? vi : en)[key]
}

/** ✓ (xanh) / ! (đỏ) trên icon ~1,5 s — báo đã sao chép (thanh địa chỉ không có chỗ nào khác để báo). */
async function flashBadge(ok: boolean): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: ok ? '#16a34a' : '#dc2626' })
  await chrome.action.setBadgeText({ text: ok ? '✓' : '!' })
  setTimeout(() => void chrome.action.setBadgeText({ text: '' }), 1500)
}

/** Mở popup ở route (cách menu chuột phải); không mở được (vd không có cửa sổ đang focus) → mở BBQOne trong tab. */
async function openPopupAt(route: string): Promise<void> {
  await chrome.storage.local.set({ [BBQ_PENDING_ROUTE_KEY]: route })
  try {
    await chrome.action.openPopup()
  } catch {
    await chrome.storage.local.remove(BBQ_PENDING_ROUTE_KEY)
    await chrome.tabs.create({ url: chrome.runtime.getURL(`index.html#${route}`) })
  }
}

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  void (async () => {
    let data: OmniboxData
    try {
      data = await loadOmniboxData()
    } catch (e) {
      console.warn('[BBQOne] omnibox: không đọc được ghi chú', e)
      return
    }
    // S12: Tắt → không tìm, không gợi ý ghi chú nào.
    if (data.mode === 'off') {
      chrome.omnibox.setDefaultSuggestion({ description: omniboxText(data.lang, 'omnibox.off') })
      suggest([])
      return
    }
    const hits = searchNotesForOmnibox({ notes: data.notes, bodies: data.bodies, folders: data.folders, query: text })
    const untitled = omniboxText(data.lang, 'notes.untitled')
    const folderNames = new Map(data.folders.map((f) => [f.id, f.name]))
    chrome.omnibox.setDefaultSuggestion({
      description: omniboxText(data.lang, hits.length > 0 || !text.trim() ? 'omnibox.default' : 'omnibox.noResults'),
    })
    suggest(
      hits.map((h) => ({
        content: omniboxContent(h.note, untitled),
        description: omniboxDescription(
          h,
          h.note.folder_id ? folderNames.get(h.note.folder_id) ?? null : null,
          text,
          untitled,
          data.mode,
        ),
      })),
    )
  })()
})

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  void (async () => {
    let data: OmniboxData
    try {
      data = await loadOmniboxData()
    } catch (e) {
      console.warn('[BBQOne] omnibox: không đọc được ghi chú', e)
      await openPopupAt(omniboxSearchRoute(text.trim()))
      return
    }
    // S12: Tắt → chỉ mở BBQOne, không mang chữ đã gõ vào, không sao chép.
    if (data.mode === 'off') {
      await openPopupAt('/dashboard')
      return
    }
    const noteId = resolveOmniboxNoteId(text, data.notes)
    // Sir: Enter = mở; Alt+Enter (Chrome báo "mở tab mới") = sao chép cả ghi chú, không mở gì.
    if (noteId && disposition !== 'currentTab') {
      const { ok } = await copyViaOffscreen(noteCopyText(data.bodies.filter((b) => b.note_id === noteId)))
      await flashBadge(ok)
      return
    }
    await openPopupAt(noteId ? omniboxNoteRoute(noteId) : omniboxSearchRoute(text.trim()))
  })()
})
