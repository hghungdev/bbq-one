/** Format a Date to 'YYYY-MM-DD' using local time (NO timezone shift). */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Chuẩn hoá mọi giá trị từ API/storage về 'YYYY-MM-DD' (cột DATE hoặc ISO). */
export function normalizeLocalDateKey(raw: string): string {
  if (!raw) return raw
  return raw.length >= 10 ? raw.slice(0, 10) : raw
}

/** Parse 'YYYY-MM-DD' (or ISO prefix) to local Date at 00:00 — chỉ dùng 10 ký tự đầu, tránh lệch timezone. */
export function parseLocalDate(s: string): Date {
  const key = normalizeLocalDateKey(s)
  if (!key || key.length < 10) return new Date(NaN)
  return parseLocalDateKey(key)
}

/** Parse đã chuẩn hoá YYYY-MM-DD. */
function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Today as 'YYYY-MM-DD' local. */
export function todayLocalKey(): string {
  return formatLocalDate(new Date())
}

/** `true` if local date key `YYYY-MM-DD` is strictly before today (local). Lexicographic compare is valid. */
export function isPastLocalDay(dateKey: string): boolean {
  if (!dateKey || dateKey.length < 10) return false
  return dateKey < todayLocalKey()
}

/** Same-day comparison by local key. */
export function isSameDay(a: Date, b: Date): boolean {
  return formatLocalDate(a) === formatLocalDate(b)
}

/**
 * Generate a 6-week (42 cell) grid for a given month.
 * Week starts on Monday (consistent with image mockup).
 * Returns array of 42 Date objects covering: prev month tail, current month, next month head.
 */
export function buildMonthGrid(year: number, month: number): Date[] {
  // month is 0-indexed (0 = Jan, 11 = Dec)
  const firstOfMonth = new Date(year, month, 1)
  // Monday = 1, Sunday = 7 in our scheme
  const jsDay = firstOfMonth.getDay() // 0=Sun..6=Sat
  const mondayOffset = jsDay === 0 ? 6 : jsDay - 1
  const gridStart = new Date(year, month, 1 - mondayOffset)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  }
  return cells
}

/** Add N months (handles wrap correctly). */
export function addMonths(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const total = year * 12 + month + delta
  return { year: Math.floor(total / 12), month: total % 12 }
}

/** ISO week number (optional, for left-column "19/20/21/22" in mockup). */
export function getISOWeek(d: Date): number {
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
}
