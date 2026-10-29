import type { CalendarEvent } from '@/types/calendar'

/**
 * U6: dữ liệu cho chip lịch trên header (thay 2 banner "hôm nay" / "ngày mai"). Thuần — không đụng
 * store / storage, để test được.
 */

export interface AgendaItem {
  id: string
  title: string
  /** 'HH:MM' hoặc 'HH:MM–HH:MM'; null = không đặt giờ. */
  time: string | null
  done: boolean
  color: string | null
}

export interface AgendaDay {
  dateKey: string
  items: AgendaItem[]
}

/** U12: sự kiện đã qua chưa xong — tổng số + vài mục đầu (kèm ngày) để hiện trong bảng. */
export interface AgendaOverdue {
  count: number
  items: (AgendaItem & { dateKey: string })[]
}

export interface Agenda {
  overdue: AgendaOverdue | null
  today: AgendaDay | null
  tomorrow: AgendaDay | null
}

/** Số mục quá hạn liệt kê trong bảng; còn lại gom thành "và n việc khác". */
export const AGENDA_OVERDUE_PREVIEW = 3

export interface AgendaChip {
  /** Chữ chính của chip: hôm nay (vàng) > ngày mai (xanh) > chỉ còn quá hạn (đỏ). */
  tone: 'today' | 'tomorrow' | 'overdue'
  dateKey: string
  titles: string[]
  /** Số sự kiện ngày mai khi chip đang hiện hôm nay ("· Mai 3"); 0 nếu không có. */
  tomorrowCount: number
  /** U12: số việc quá hạn (đoạn "· 5 quá hạn", hoặc chữ chính khi tone = overdue). */
  overdueCount: number
}

type AgendaEvent = Pick<
  CalendarEvent,
  'id' | 'title' | 'position' | 'is_done' | 'color' | 'start_time' | 'end_time'
>

function itemOf(e: AgendaEvent): AgendaItem {
  return {
    id: e.id,
    title: e.title.trim(),
    time: timeLabel(e),
    done: e.is_done,
    color: e.color,
  }
}

function timeLabel(e: AgendaEvent): string | null {
  if (!e.start_time) return null
  return e.end_time ? `${e.start_time}–${e.end_time}` : e.start_time
}

function dayOf(dateKey: string, events: AgendaEvent[]): AgendaDay | null {
  const items = events
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(itemOf)
    .filter((i) => i.title !== '')
  return items.length > 0 ? { dateKey, items } : null
}

/**
 * Ngày mai trả null nếu user đã ẩn nhắc của ĐÚNG ngày đó (ẩn ngày khác không tính).
 * `overdue`: danh sách đã lọc + sắp sẵn (listOverdueIncompleteEvents — cũ → mới).
 */
export function buildAgenda(
  eventsForDate: (dateKey: string) => AgendaEvent[],
  todayKey: string,
  tomorrowKey: string,
  dismissedTomorrowKey: string | null,
  overdue: (AgendaEvent & { event_date: string })[] = [],
): Agenda {
  return {
    overdue:
      overdue.length > 0
        ? {
            count: overdue.length,
            items: overdue
              .slice(0, AGENDA_OVERDUE_PREVIEW)
              .map((e) => ({ ...itemOf(e), dateKey: e.event_date })),
          }
        : null,
    today: dayOf(todayKey, eventsForDate(todayKey)),
    tomorrow:
      dismissedTomorrowKey === tomorrowKey ? null : dayOf(tomorrowKey, eventsForDate(tomorrowKey)),
  }
}

export function agendaChip(agenda: Agenda): AgendaChip | null {
  const { overdue, today, tomorrow } = agenda
  const overdueCount = overdue?.count ?? 0
  if (today) {
    return {
      tone: 'today',
      dateKey: today.dateKey,
      titles: today.items.map((i) => i.title),
      tomorrowCount: tomorrow?.items.length ?? 0,
      overdueCount,
    }
  }
  if (tomorrow) {
    return {
      tone: 'tomorrow',
      dateKey: tomorrow.dateKey,
      titles: tomorrow.items.map((i) => i.title),
      tomorrowCount: 0,
      overdueCount,
    }
  }
  if (overdue) {
    return {
      tone: 'overdue',
      dateKey: overdue.items[0]?.dateKey ?? '',
      titles: overdue.items.map((i) => i.title),
      tomorrowCount: 0,
      overdueCount,
    }
  }
  return null
}

/**
 * U14: dòng quá hạn của bảng ĐANG MỞ — theo đúng thứ tự `ids` chụp lúc mở, trạng thái xong lấy từ store.
 * Việc vừa đánh dấu xong vẫn ở chỗ cũ (gạch ngang, bấm lại = hoàn tác); id đã bị xóa thì bỏ qua.
 */
export function overduePanelRows(
  ids: string[],
  events: (AgendaEvent & { event_date: string })[],
): (AgendaItem & { dateKey: string })[] {
  const byId = new Map(events.map((e) => [e.id, e]))
  return ids.flatMap((id) => {
    const e = byId.get(id)
    if (!e) return []
    const item = itemOf(e)
    return item.title === '' ? [] : [{ ...item, dateKey: e.event_date }]
  })
}

/**
 * U30 (thay U18 "vài tên + +n"): chip header hiện ĐỦ tên khi tất cả vừa `available` px; không vừa hết thì
 * ghi số ("6 sự kiện") — Sir: ngày 5–6 sự kiện không được gom một phần. Một tên dài quá chỗ vẫn hiện tên
 * (CSS cắt "…"), ghi "1 sự kiện" thì mất thông tin.
 */
export function titlesNeedCount(widths: number[], available: number, sepWidth: number): boolean {
  if (widths.length < 2) return false
  let need = sepWidth * (widths.length - 1)
  for (const w of widths) need += w
  return need > available
}

/** U30: số sự kiện ngày mai liệt kê trong bảng trước nút "Xem thêm n". */
export const AGENDA_TOMORROW_PREVIEW = 3

/** U30: `limit` mục đầu + số mục còn ẩn; `expanded` → đủ cả. Không sửa mảng gốc. */
export function previewItems<T>(items: readonly T[], limit: number, expanded: boolean): { shown: T[]; more: number } {
  if (expanded || items.length <= limit) return { shown: items.slice(), more: 0 }
  return { shown: items.slice(0, limit), more: items.length - limit }
}
