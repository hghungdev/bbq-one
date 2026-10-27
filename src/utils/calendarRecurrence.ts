import { formatLocalDate, parseLocalDate } from '@/utils/calendarDate'

/**
 * U3: sự kiện lặp lại = tạo sẵn từng lần lặp (mỗi lần là một calendar_events row bình thường).
 * File này chỉ tính NGÀY của các lần lặp — thuần, không đụng store/service.
 */
export type RecurrenceFreq = 'none' | 'weekly' | 'monthly' | 'yearly'
export type RepeatingFreq = Exclude<RecurrenceFreq, 'none'>

/** Số lần (gồm lần đầu) mặc định khi chọn tần suất. */
export const RECURRENCE_DEFAULT_COUNT: Record<RepeatingFreq, number> = {
  weekly: 4,
  monthly: 6,
  yearly: 3,
}

/** Trần số lần — tránh lỡ tay tạo hàng trăm sự kiện. */
export const RECURRENCE_MAX_COUNT: Record<RepeatingFreq, number> = {
  weekly: 52,
  monthly: 24,
  yearly: 10,
}

export function clampRecurrenceCount(freq: RecurrenceFreq, count: number): number {
  if (freq === 'none') return 1
  const n = Number.isFinite(count) ? Math.floor(count) : 1
  return Math.min(Math.max(n, 1), RECURRENCE_MAX_COUNT[freq])
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

/**
 * Ngày 'YYYY-MM-DD' của từng lần lặp, gồm cả ngày gốc.
 * Tháng / năm: luôn lấy ngày-trong-tháng của NGÀY GỐC; tháng thiếu ngày → ngày cuối tháng
 * (31/01 → 28/02 → 31/03, không trôi dần về 28). 29/02 hằng năm → 28/02 năm không nhuận.
 */
export function recurrenceDates(startKey: string, freq: RecurrenceFreq, count: number): string[] {
  const start = parseLocalDate(startKey)
  if (Number.isNaN(start.getTime())) return []
  const n = clampRecurrenceCount(freq, count)
  const y = start.getFullYear()
  const m = start.getMonth()
  const d = start.getDate()
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    if (freq === 'weekly' || freq === 'none') {
      out.push(formatLocalDate(new Date(y, m, d + 7 * i)))
      continue
    }
    const monthOffset = freq === 'monthly' ? i : 12 * i
    const year = y + Math.floor((m + monthOffset) / 12)
    const month = (m + monthOffset) % 12
    out.push(formatLocalDate(new Date(year, month, Math.min(d, daysInMonth(year, month)))))
  }
  return out
}
