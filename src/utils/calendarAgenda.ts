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
 * U18: chip header hiện bao nhiêu tên TRỌN VẸN thì vừa `available` px — còn lại gom thành "+n"
 * (cách Gmail hiện người nhận). Chỉ chừa chỗ cho "+n" khi thật sự có tên bị ẩn. Ít nhất 1: tên đầu dài
 * hơn cả chỗ trống thì để CSS cắt riêng nó ("…"), vẫn kèm "+n".
 */
export function fitTitleCount(
  widths: number[],
  available: number,
  sepWidth: number,
  moreWidth: (hidden: number) => number,
): number {
  const n = widths.length
  if (n === 0) return 0
  for (let k = n; k >= 1; k--) {
    let need = sepWidth * (k - 1)
    for (let i = 0; i < k; i++) need += widths[i]
    if (k < n) need += moreWidth(n - k)
    if (need <= available) return k
  }
  return 1
}
