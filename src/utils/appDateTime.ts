/** Múi giờ app: mặc định UTC+0; người dùng cấu hình trong Settings. */
export const DEFAULT_UTC_OFFSET_HOURS = 0
export const UTC_OFFSET_MIN = -12
export const UTC_OFFSET_MAX = 14

/** Các bước UTC hợp lệ trong Settings (−12 … +14). */
export const UTC_OFFSET_OPTIONS: readonly number[] = Array.from(
  { length: UTC_OFFSET_MAX - UTC_OFFSET_MIN + 1 },
  (_, i) => UTC_OFFSET_MIN + i,
)

export function normalizeUtcOffsetHours(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_UTC_OFFSET_HOURS
  const rounded = Math.trunc(n)
  if (rounded < UTC_OFFSET_MIN) return UTC_OFFSET_MIN
  if (rounded > UTC_OFFSET_MAX) return UTC_OFFSET_MAX
  return rounded
}

/** Nhãn hiển thị: UTC+0, UTC+7, UTC-5 */
export function formatUtcOffsetLabel(offsetHours: number): string {
  const h = normalizeUtcOffsetHours(offsetHours)
  if (h === 0) return 'UTC+0'
  if (h > 0) return `UTC+${h}`
  return `UTC${h}`
}

function shiftToAppInstant(date: Date, utcOffsetHours: number): Date {
  return new Date(date.getTime() + normalizeUtcOffsetHours(utcOffsetHours) * 3_600_000)
}

/** Header clock tooltip: `2026-05-21 21:05` */
export function formatAppDateTime(date: Date, utcOffsetHours: number): string {
  const s = shiftToAppInstant(date, utcOffsetHours)
  const y = s.getUTCFullYear()
  const m = String(s.getUTCMonth() + 1).padStart(2, '0')
  const d = String(s.getUTCDate()).padStart(2, '0')
  const h = String(s.getUTCHours()).padStart(2, '0')
  const min = String(s.getUTCMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

/** List folder/note: ngày theo múi giờ app, format YYYY/MM/dd. */
export function formatListUpdatedAt(iso: string, utcOffsetHours: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const s = shiftToAppInstant(d, utcOffsetHours)
  const y = s.getUTCFullYear()
  const m = String(s.getUTCMonth() + 1).padStart(2, '0')
  const day = String(s.getUTCDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}
