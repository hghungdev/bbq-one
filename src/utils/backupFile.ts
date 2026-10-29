import {
  CALENDAR_DESCRIPTION_MAX,
  CALENDAR_EVENTS_CACHE_KEY,
  CALENDAR_MAX_EVENTS_PER_DAY,
  CALENDAR_TITLE_MAX,
} from '@/constants/calendar'
import {
  BOOKMARKS_CACHE_KEY,
  FOLDERS_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  NOTES_CACHE_KEY,
} from '@/constants/storage'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import { parseEnvelopeV2 } from '@/utils/secureCrypto'

/**
 * B1: sao lưu ra file JSON + khôi phục — phần thuần (không đụng chrome.*), test được.
 * File là dữ liệu NGOÀI khi nạp lại: `parseBackup` kiểm từng trường, bỏ trường lạ, đếm dòng bị bỏ.
 */

export const BACKUP_APP = 'bbqone'
export const BACKUP_FORMAT = 1
/** Lớn hơn → từ chối trước khi đọc (2.000 ghi chú + 11 bản bookmark ≈ 9 MB). */
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024
/** Cây bookmark sâu hơn → cắt (không để file lạ làm tràn stack). */
const BOOKMARK_MAX_DEPTH = 64

type Row = Record<string, unknown>

export interface BackupData {
  folders: Row[]
  notes: Row[]
  note_bodies: Row[]
  calendar_events: Row[]
  bookmark_backups: Row[]
}

export type BackupCounts = Record<keyof BackupData, number>

export interface BackupFile {
  app: typeof BACKUP_APP
  format: number
  exported_at: string
  app_version: string
  counts: BackupCounts
  data: BackupData
}

export interface DroppedReport {
  /** Sai kiểu / thiếu trường / sự kiện sai ngày, tên quá dài… */
  invalid: number
  duplicate: number
  /** Section không thuộc ghi chú nào trong file. */
  orphanBodies: number
  /** Sự kiện vượt CALENDAR_MAX_EVENTS_PER_DAY của một ngày. */
  overCap: number
  /** Bookmark có đường dẫn không phải http(s) / ftp / file (javascript:, data:…). */
  unsafeBookmarks: number
}

export type ParseError = 'too_large' | 'not_json' | 'not_bbqone' | 'newer_format' | 'invalid'
export type ParseResult =
  | { ok: true; file: BackupFile; dropped: DroppedReport }
  | { ok: false; error: ParseError }

const KINDS = ['folders', 'notes', 'note_bodies', 'calendar_events', 'bookmark_backups'] as const

export function backupCounts(data: BackupData): BackupCounts {
  return {
    folders: data.folders.length,
    notes: data.notes.length,
    note_bodies: data.note_bodies.length,
    calendar_events: data.calendar_events.length,
    bookmark_backups: data.bookmark_backups.length,
  }
}

export function isBackupEmpty(data: BackupData): boolean {
  return KINDS.every((k) => data[k].length === 0)
}

/** Bỏ cờ nội bộ (`__synced`) và `user_id` — file không gắn với tài khoản / máy nào. */
function stripInternal(rows: readonly Row[]): Row[] {
  return rows.map((r) => {
    const out: Row = {}
    for (const [k, v] of Object.entries(r)) if (k !== '__synced' && k !== 'user_id') out[k] = v
    return out
  })
}

/** Dữ liệu đọc từ kho (bbqone_local_* hoặc cache) → dạng ghi vào file. */
export function toBackupData(raw: Partial<Record<keyof BackupData, unknown>>): BackupData {
  const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])
  return {
    folders: stripInternal(arr(raw.folders)),
    notes: stripInternal(arr(raw.notes)),
    note_bodies: stripInternal(arr(raw.note_bodies)),
    calendar_events: stripInternal(arr(raw.calendar_events)),
    bookmark_backups: stripInternal(arr(raw.bookmark_backups)),
  }
}

export function buildBackup(data: BackupData, meta: { appVersion: string; now: Date }): BackupFile {
  const clean = toBackupData(data)
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exported_at: meta.now.toISOString(),
    app_version: meta.appVersion,
    counts: backupCounts(clean),
    data: clean,
  }
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 1)
}

const pad = (n: number): string => String(n).padStart(2, '0')
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** Ngày giờ MÁY: 'YYYY-MM-DD'. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Tên file (thư mục con tính từ Tải xuống). Tự động: một file mỗi thứ trong tuần, tuần sau ghi đè → luôn còn 7 ngày
 * gần nhất, không đầy thư mục.
 */
export function backupFileName(kind: 'manual' | 'auto' | 'before-restore', now: Date): string {
  const stamp = `${localDayKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}`
  if (kind === 'auto') return `BBQOne/bbqone-auto-${WEEKDAYS[now.getDay()]}.json`
  if (kind === 'before-restore') return `bbqone-before-restore-${stamp}.json`
  return `bbqone-backup-${stamp}.json`
}

/** SHA-256 (hex) của phần dữ liệu — "đã đổi so với lần sao lưu trước chưa". */
export async function backupDigest(data: BackupData): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Điều kiện RẺ trước khi đọc toàn kho: công tắc bật, chưa đăng nhập, hôm nay chưa kiểm. Đọc + băm chỉ khi qua được
 * → mỗi ngày đọc toàn kho tối đa 1 lần lúc mở popup.
 */
export function shouldCheckAutoBackup(input: {
  enabled: boolean
  signedIn: boolean
  todayKey: string
  lastCheckDay: string | null
}): boolean {
  return input.enabled && !input.signedIn && input.lastCheckDay !== input.todayKey
}

// ─── Đọc file (dữ liệu ngoài, KHÔNG tin cậy) ───────────────────────────────────────────────────────────────────────
//
// Mô hình đe dọa: file có thể bị sửa có chủ đích (chèn script / link độc / dữ liệu làm treo máy). Nguyên tắc:
// - chỉ ghi đúng 5 loại dữ liệu đã biết vào đúng khóa kho đã biết (file không chọn được khóa nào khác);
// - danh sách trắng từng trường + kiểu + độ dài; trường lạ bị bỏ; khóa `__proto__` / `constructor` không bao giờ
//   được gán (chỉ nhận khóa có trong schema, kiểm bằng hasOwnProperty);
// - id + tham chiếu là UUID; ngày / giờ / màu đúng mẫu; số vòng PBKDF2 có trần (chống treo khi mở khóa);
// - nội dung ghi chú (HTML) đi qua `sanitizeHtml` (schema của trình soạn — bỏ script, ảnh, iframe, link, thuộc tính
//   on*…), trừ bản mã hóa thật (định dạng envelope kiểm chặt);
// - bookmark chỉ http(s) / ftp / file; cây giới hạn độ sâu + số nút.

/** Trần số dòng mỗi loại / số nút mỗi cây bookmark — file lạ không làm treo trang. */
const MAX_ROWS = 100_000
const MAX_TREE_NODES = 200_000
const PBKDF2_MIN = 1_000
const PBKDF2_MAX = 5_000_000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const B64_RE = /^[A-Za-z0-9+/=_-]*$/
/** Envelope v1 thật: tiền tố + base64 (không có `<`, khoảng trắng…) — chuỗi giả dạng có chèn thẻ thì lọc như HTML. */
const ENVELOPE_V1_RE = /^retronote:1:[A-Za-z0-9+/=_-]+$/

type FieldType =
  | 'string' | 'string|null' | 'string[]' | 'number' | 'int' | 'boolean' | 'array'
  | 'uuid' | 'uuid|null' | 'iso' | 'date' | 'hhmm|null' | 'b64|null'
interface Field {
  type: FieldType
  optional?: boolean
  /** Độ dài tối đa (chuỗi) / số phần tử (mảng chuỗi). */
  max?: number
  /** `int`: khoảng cho phép. */
  min?: number
  top?: number
}
type Schema = Record<string, Field>

const f = (type: FieldType, extra: Omit<Field, 'type'> = {}): Field => ({ type, ...extra })
const optional = (type: FieldType, extra: Omit<Field, 'type'> = {}): Field => ({ type, optional: true, ...extra })
const POS: Field = f('int', { min: -1e9, top: 1e9 })

const FOLDER: Schema = {
  id: f('uuid'), name: f('string', { max: 500 }), position: POS, created_at: f('iso'), updated_at: f('iso'),
  is_secure: f('boolean'), secure_salt: f('b64|null', { max: 200 }),
  pbkdf2_iterations: f('int', { min: PBKDF2_MIN, top: PBKDF2_MAX }), secure_verifier_enc: f('string|null', { max: 4_000 }),
}
const NOTE: Schema = {
  id: f('uuid'), folder_id: f('uuid|null'), title: f('string', { max: 10_000 }),
  tags: f('string[]', { max: 100 }), created_at: f('iso'), updated_at: f('iso'), synced_at: optional('string|null', { max: 40 }),
}
const NOTE_BODY: Schema = {
  id: f('uuid'), note_id: f('uuid'), label: f('string', { max: 4_000 }), content: f('string', { max: 5_000_000 }),
  position: POS, created_at: f('iso'), updated_at: f('iso'), synced_at: optional('string|null', { max: 40 }),
}
const EVENT: Schema = {
  id: f('uuid'), event_date: f('date'), title: f('string', { max: CALENDAR_TITLE_MAX }),
  description: f('string', { max: CALENDAR_DESCRIPTION_MAX }), is_done: f('boolean'), position: POS,
  color: f('string|null', { max: 200 }), start_time: f('hhmm|null'), end_time: f('hhmm|null'), created_at: f('iso'),
  updated_at: f('iso'), synced_at: optional('string|null', { max: 40 }), series_id: optional('uuid|null'),
}
const BOOKMARK_BACKUP: Schema = {
  id: f('uuid'), label: f('string', { max: 500 }), tree_json: f('array'), browser_hint: f('string', { max: 50 }),
  created_at: f('iso'), encrypted: optional('boolean'),
}
const NODE: Schema = {
  id: f('string', { max: 100 }), parentId: optional('string', { max: 100 }), index: optional('int', { min: 0, top: 1e7 }),
  url: optional('string', { max: 8_192 }), title: f('string', { max: 2_000 }), dateAdded: optional('number'),
  dateGroupModified: optional('number'), children: optional('array'),
}

function typeOk(v: unknown, field: Field): boolean {
  const len = (x: string): boolean => field.max === undefined || x.length <= field.max
  switch (field.type) {
    case 'string':
      return typeof v === 'string' && len(v)
    case 'string|null':
      return v === null || (typeof v === 'string' && len(v))
    case 'string[]':
      return Array.isArray(v) && (field.max === undefined || v.length <= field.max) &&
        v.every((x) => typeof x === 'string' && x.length <= 200)
    case 'number':
      return typeof v === 'number' && Number.isFinite(v)
    case 'int':
      return Number.isInteger(v) && (v as number) >= (field.min ?? -Infinity) && (v as number) <= (field.top ?? Infinity)
    case 'boolean':
      return typeof v === 'boolean'
    case 'array':
      return Array.isArray(v)
    case 'uuid':
      return typeof v === 'string' && UUID_RE.test(v)
    case 'uuid|null':
      return v === null || (typeof v === 'string' && UUID_RE.test(v))
    case 'iso':
      return typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v))
    case 'date':
      return typeof v === 'string' && DATE_RE.test(v)
    case 'hhmm|null':
      return v === null || (typeof v === 'string' && HHMM_RE.test(v))
    case 'b64|null':
      return v === null || (typeof v === 'string' && len(v) && B64_RE.test(v))
  }
}

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/**
 * Giữ đúng thứ tự trường của file; chỉ khóa có trong schema (hasOwn — `__proto__`, `constructor`… không bao
 * giờ được gán); sai kiểu / thiếu trường bắt buộc → null.
 */
function pick(row: unknown, schema: Schema): Row | null {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (!hasOwn(schema, k)) continue
    const field = schema[k]
    if (v === undefined && field.optional) continue
    if (!typeOk(v, field)) return null
    out[k] = v
  }
  for (const [k, field] of Object.entries(schema)) if (!field.optional && !hasOwn(out, k)) return null
  return out
}

function pickAll(rows: unknown, schema: Schema, report: DroppedReport): Row[] {
  if (!Array.isArray(rows)) return []
  const seen = new Set<string>()
  const out: Row[] = []
  for (const [i, r] of rows.entries()) {
    if (i >= MAX_ROWS) {
      report.invalid += rows.length - MAX_ROWS
      break
    }
    const p = pick(r, schema)
    if (!p) {
      report.invalid++
      continue
    }
    const id = (p.id as string).toLowerCase()
    if (seen.has(id)) {
      report.duplicate++
      continue
    }
    seen.add(id)
    out.push(p)
  }
  return out
}

/** Nội dung là bản mã hóa THẬT (thư mục bảo mật / tài khoản mã hóa) — giữ nguyên, không lọc như HTML. */
export function isCiphertext(value: string): boolean {
  return ENVELOPE_V1_RE.test(value) || parseEnvelopeV2(value) !== null
}

const SAFE_URL = /^(https?|ftp|file):/i

/** Cây bookmark: danh sách trắng trường; chỉ đường dẫn http(s) / ftp / file (javascript:, data: … chạy mã khi bấm). */
function sanitizeTree(nodes: unknown[], depth: number, report: DroppedReport, budget: { left: number }): Row[] {
  if (depth > BOOKMARK_MAX_DEPTH) return []
  const out: Row[] = []
  for (const n of nodes) {
    if (budget.left <= 0) break
    const p = pick(n, NODE)
    if (!p) continue
    if (typeof p.url === 'string' && !SAFE_URL.test(p.url.trim())) {
      report.unsafeBookmarks++
      continue
    }
    budget.left--
    if (Array.isArray(p.children)) p.children = sanitizeTree(p.children, depth + 1, report, budget)
    out.push(p)
  }
  return out
}

/**
 * Đọc file sao lưu. `sanitizeHtml`: lọc nội dung ghi chú theo schema trình soạn (`utils/noteHtmlSanitize.ts` — cần
 * DOM, chạy trong trang); bắt buộc truyền để không ai quên lọc.
 */
export function parseBackup(text: string, sanitizeHtml: (html: string) => string): ParseResult {
  if (text.length > BACKUP_MAX_BYTES) return { ok: false, error: 'too_large' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not_json' }
  }
  if (typeof raw !== 'object' || raw === null || (raw as Row).app !== BACKUP_APP) return { ok: false, error: 'not_bbqone' }
  const file = raw as Row
  if (!Number.isInteger(file.format) || (file.format as number) < 1) return { ok: false, error: 'invalid' }
  if ((file.format as number) > BACKUP_FORMAT) return { ok: false, error: 'newer_format' }
  const data = file.data as Partial<Record<keyof BackupData, unknown>> | undefined
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, error: 'invalid' }

  const dropped: DroppedReport = { invalid: 0, duplicate: 0, orphanBodies: 0, overCap: 0, unsafeBookmarks: 0 }
  const folders = pickAll(data.folders, FOLDER, dropped)
  const folderIds = new Set(folders.map((x) => x.id as string))
  const notes = pickAll(data.notes, NOTE, dropped).map((n) =>
    n.folder_id !== null && !folderIds.has(n.folder_id as string) ? { ...n, folder_id: null } : n,
  )
  const noteIds = new Set(notes.map((n) => n.id as string))
  const note_bodies = pickAll(data.note_bodies, NOTE_BODY, dropped)
    .filter((b) => {
      if (noteIds.has(b.note_id as string)) return true
      dropped.orphanBodies++
      return false
    })
    .map((b) => (isCiphertext(b.content as string) ? b : { ...b, content: sanitizeHtml(b.content as string) }))

  const events = pickAll(data.calendar_events, EVENT, dropped).map((e) =>
    e.color !== null && !COLOR_RE.test(e.color as string) ? { ...e, color: null } : e,
  )
  // Tối đa CALENDAR_MAX_EVENTS_PER_DAY / ngày — giữ theo position.
  const keep = new Set<Row>()
  const byDay = new Map<string, Row[]>()
  for (const e of events) {
    const list = byDay.get(e.event_date as string)
    if (list) list.push(e)
    else byDay.set(e.event_date as string, [e])
  }
  for (const list of byDay.values()) {
    const sorted = list.slice().sort((a, b) => (a.position as number) - (b.position as number))
    sorted.slice(0, CALENDAR_MAX_EVENTS_PER_DAY).forEach((e) => keep.add(e))
    dropped.overCap += Math.max(0, sorted.length - CALENDAR_MAX_EVENTS_PER_DAY)
  }
  const calendar_events = events.filter((e) => keep.has(e))

  const bookmark_backups = pickAll(data.bookmark_backups, BOOKMARK_BACKUP, dropped).map((b) => ({
    ...b,
    tree_json: sanitizeTree(b.tree_json as unknown[], 0, dropped, { left: MAX_TREE_NODES }),
  }))

  const clean: BackupData = { folders, notes, note_bodies, calendar_events, bookmark_backups }
  return {
    ok: true,
    dropped,
    file: {
      app: BACKUP_APP,
      format: file.format as number,
      exported_at: typeof file.exported_at === 'string' && file.exported_at.length <= 40 ? file.exported_at : '',
      app_version: typeof file.app_version === 'string' ? file.app_version.slice(0, 20) : '',
      counts: backupCounts(clean),
      data: clean,
    },
  }
}

// ─── Khôi phục: "thay toàn bộ" ────────────────────────────────────────────────────────────────────────────────────

/**
 * Mọi khóa cần ghi khi thay toàn bộ: kho máy (`bbqone_local_*` — `__synced: false`, `synced_at: null` để sau này đăng
 * nhập vẫn được đẩy lên) + cache store đọc khi mở (`user_id: ''` như chế độ không đăng nhập).
 */
export function restoreWrites(data: BackupData): Record<string, Row[]> {
  const unsynced = (rows: Row[]): Row[] => rows.map((r) => ({ ...r, synced_at: null }))
  const local = (rows: Row[]): Row[] => rows.map((r) => ({ ...r, __synced: false }))
  const cache = (rows: Row[]): Row[] => rows.map((r) => ({ ...r, user_id: '' }))
  const notes = unsynced(data.notes)
  const bodies = unsynced(data.note_bodies)
  const events = unsynced(data.calendar_events)
  return {
    [LOCAL_STORAGE_KEYS.folders]: local(data.folders),
    [LOCAL_STORAGE_KEYS.notes]: local(notes),
    [LOCAL_STORAGE_KEYS.noteBodies]: local(bodies),
    [LOCAL_STORAGE_KEYS.calendarEvents]: local(events),
    [LOCAL_STORAGE_KEYS.bookmarks]: local(data.bookmark_backups),
    [FOLDERS_CACHE_KEY]: cache(data.folders),
    [NOTES_CACHE_KEY]: cache(notes),
    [NOTE_BODIES_CACHE_KEY]: cache(bodies),
    [CALENDAR_EVENTS_CACHE_KEY]: cache(events),
    [BOOKMARKS_CACHE_KEY]: cache(data.bookmark_backups),
  }
}
