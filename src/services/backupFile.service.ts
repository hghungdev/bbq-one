import {
  backupCounts,
  backupDigest,
  backupFileName,
  buildBackup,
  isBackupEmpty,
  localDayKey,
  restoreWrites,
  serializeBackup,
  shouldCheckAutoBackup,
  toBackupData,
  type BackupCounts,
  type BackupData,
} from '@/utils/backupFile'
import {
  BBQ_AUTH_LOGGED_IN_KEY,
  BBQ_BACKUP_STATE_KEY,
  BBQ_NOTE_DRAFT_SESSION_KEY,
  BBQ_PENDING_DELETE_COMMITS_KEY,
  BBQ_RESTORE_EPOCH_KEY,
  BOOKMARKS_CACHE_KEY,
  FOLDERS_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  NOTES_CACHE_KEY,
} from '@/constants/storage'
import { CALENDAR_EVENTS_CACHE_KEY } from '@/constants/calendar'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'

/**
 * B1: sao lưu ra file (Tải xuống) + khôi phục "thay toàn bộ" — chế độ không đăng nhập. Quyền `downloads` sẵn có.
 * Đọc từ kho (dạng lưu thật): ghi chú thư mục bảo mật giữ nguyên mã hóa, không lấy bản đã giải mã trong RAM.
 */

export interface BackupState {
  /** Công tắc "Tự động sao lưu" — mặc định BẬT (chưa từng chỉnh). */
  autoEnabled: boolean
  lastBackupAt: string | null
  /** SHA-256 phần dữ liệu của lần sao lưu gần nhất (tự động hoặc tay). */
  lastBackupDigest: string | null
  /** Ngày (giờ máy) tự sao lưu đã kiểm — mỗi ngày đọc toàn kho tối đa 1 lần. */
  lastCheckDay: string | null
  lastRestore: { at: string; counts: BackupCounts } | null
}

export async function readBackupState(): Promise<BackupState> {
  const r = await chrome.storage.local.get(BBQ_BACKUP_STATE_KEY)
  const s = (r[BBQ_BACKUP_STATE_KEY] ?? {}) as Partial<BackupState>
  return {
    autoEnabled: s.autoEnabled !== false,
    lastBackupAt: s.lastBackupAt ?? null,
    lastBackupDigest: s.lastBackupDigest ?? null,
    lastCheckDay: s.lastCheckDay ?? null,
    lastRestore: s.lastRestore ?? null,
  }
}

export async function writeBackupState(patch: Partial<BackupState>): Promise<void> {
  const cur = await readBackupState()
  await chrome.storage.local.set({ [BBQ_BACKUP_STATE_KEY]: { ...cur, ...patch } })
}

const SOURCES = {
  /** Không đăng nhập: kho máy là nguồn gốc. */
  local: {
    folders: LOCAL_STORAGE_KEYS.folders,
    notes: LOCAL_STORAGE_KEYS.notes,
    note_bodies: LOCAL_STORAGE_KEYS.noteBodies,
    calendar_events: LOCAL_STORAGE_KEYS.calendarEvents,
    bookmark_backups: LOCAL_STORAGE_KEYS.bookmarks,
  },
  /** Đã đăng nhập (cờ FEATURES.backupFileSignedIn): cache của tài khoản. */
  'account-cache': {
    folders: FOLDERS_CACHE_KEY,
    notes: NOTES_CACHE_KEY,
    note_bodies: NOTE_BODIES_CACHE_KEY,
    calendar_events: CALENDAR_EVENTS_CACHE_KEY,
    bookmark_backups: BOOKMARKS_CACHE_KEY,
  },
} as const

export type BackupSource = keyof typeof SOURCES

export async function readBackupData(source: BackupSource): Promise<BackupData> {
  const keys = SOURCES[source]
  const r = await chrome.storage.local.get(Object.values(keys))
  return toBackupData({
    folders: r[keys.folders],
    notes: r[keys.notes],
    note_bodies: r[keys.note_bodies],
    calendar_events: r[keys.calendar_events],
    bookmark_backups: r[keys.bookmark_backups],
  })
}

/**
 * Lưu vào Tải xuống, KHÔNG hỏi chỗ lưu (`saveAs: false`). Blob URL giữ 60 s rồi thu hồi — trình tải đã đọc xong từ
 * lâu (vài MB trong RAM).
 */
async function downloadJson(text: string, filename: string, overwrite: boolean): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: overwrite ? 'overwrite' : 'uniquify',
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

function appVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return ''
  }
}

/** "Sao lưu ngay" — file có ngày giờ, không ghi đè. */
export async function backupNow(opts: { source: BackupSource; now: Date }): Promise<{ filename: string; counts: BackupCounts }> {
  const data = await readBackupData(opts.source)
  const filename = backupFileName('manual', opts.now)
  await downloadJson(serializeBackup(buildBackup(data, { appVersion: appVersion(), now: opts.now })), filename, false)
  await writeBackupState({ lastBackupAt: opts.now.toISOString(), lastBackupDigest: await backupDigest(data) })
  return { filename, counts: backupCounts(data) }
}

export type AutoBackupResult = 'saved' | 'skipped' | 'unchanged' | 'empty' | 'failed'

/**
 * Tự sao lưu khi mở BBQOne (kiểu Termius "sync khi mở app"): công tắc bật, CHƯA đăng nhập, hôm nay chưa kiểm, có dữ
 * liệu, dữ liệu khác lần sao lưu trước → `BBQOne/bbqone-auto-<thứ>.json` (ghi đè cùng thứ → 7 ngày gần nhất).
 */
export async function maybeAutoBackup(opts: { signedIn: boolean; now: Date }): Promise<AutoBackupResult> {
  const state = await readBackupState()
  const todayKey = localDayKey(opts.now)
  // Cờ đăng nhập trong kho: phiên Supabase có thể chưa khôi phục xong lúc mở popup.
  const flag = await chrome.storage.local.get(BBQ_AUTH_LOGGED_IN_KEY)
  const signedIn = opts.signedIn || !!flag[BBQ_AUTH_LOGGED_IN_KEY]
  if (!shouldCheckAutoBackup({ enabled: state.autoEnabled, signedIn, todayKey, lastCheckDay: state.lastCheckDay })) {
    return 'skipped'
  }
  const data = await readBackupData('local')
  if (isBackupEmpty(data)) {
    await writeBackupState({ lastCheckDay: todayKey })
    return 'empty'
  }
  const digest = await backupDigest(data)
  if (digest === state.lastBackupDigest) {
    await writeBackupState({ lastCheckDay: todayKey })
    return 'unchanged'
  }
  try {
    const file = buildBackup(data, { appVersion: appVersion(), now: opts.now })
    await downloadJson(serializeBackup(file), backupFileName('auto', opts.now), true)
  } catch (e) {
    // Lần mở sau thử lại (không ghi "đã kiểm").
    console.error('[BBQOne] auto backup failed', e)
    return 'failed'
  }
  await writeBackupState({ lastCheckDay: todayKey, lastBackupAt: opts.now.toISOString(), lastBackupDigest: digest })
  return 'saved'
}

/**
 * Khôi phục "thay toàn bộ" (đã xác nhận 2 lần ở giao diện):
 * 1. còn dữ liệu → tải bản an toàn `bbqone-before-restore-…` (đường lui nếu nạp nhầm);
 * 2. bỏ hàng đợi xóa chờ hoàn tác TRƯỚC (background không được xóa nhầm id của dữ liệu mới) + nháp editor;
 * 3. MỘT lần ghi: kho máy + cache + epoch (trang khác đang mở tự tải lại) + trạng thái (hôm nay kiểm lại → bản mới
 *    được tự sao lưu làm mốc).
 * Người gọi tải lại trang ngay sau đó — RAM cũ không được ghi đè dữ liệu mới (N5).
 */
export async function applyRestore(input: BackupData, opts: { now: Date }): Promise<void> {
  // Bản thuần JSON: dữ liệu bọc Proxy (vd ref của Vue) bị chrome.storage ghi mảng thành object {"0": …}.
  const data = JSON.parse(JSON.stringify(input)) as BackupData
  const current = await readBackupData('local')
  if (!isBackupEmpty(current)) {
    const safety = buildBackup(current, { appVersion: appVersion(), now: opts.now })
    await downloadJson(serializeBackup(safety), backupFileName('before-restore', opts.now), false)
  }
  await chrome.storage.local.remove(BBQ_PENDING_DELETE_COMMITS_KEY)
  await chrome.storage.session?.remove(BBQ_NOTE_DRAFT_SESSION_KEY).catch(() => {})
  const state = await readBackupState()
  await chrome.storage.local.set({
    ...restoreWrites(data),
    [BBQ_RESTORE_EPOCH_KEY]: Date.now(),
    [BBQ_BACKUP_STATE_KEY]: {
      ...state,
      lastCheckDay: null,
      lastRestore: { at: opts.now.toISOString(), counts: backupCounts(data) },
    },
  })
}
