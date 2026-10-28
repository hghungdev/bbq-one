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

export interface Agenda {
  today: AgendaDay | null
  tomorrow: AgendaDay | null
}

export interface AgendaChip {
  /** Màu chấm: hôm nay (vàng) ưu tiên hơn ngày mai (xanh). */
  tone: 'today' | 'tomorrow'
  dateKey: string
  titles: string[]
  /** Số sự kiện ngày mai khi chip đang hiện hôm nay ("· Mai 3"); 0 nếu không có. */
  tomorrowCount: number
}

type AgendaEvent = Pick<
  CalendarEvent,
  'id' | 'title' | 'position' | 'is_done' | 'color' | 'start_time' | 'end_time'
>

function timeLabel(e: AgendaEvent): string | null {
  if (!e.start_time) return null
  return e.end_time ? `${e.start_time}–${e.end_time}` : e.start_time
}

function dayOf(dateKey: string, events: AgendaEvent[]): AgendaDay | null {
  const items = events
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      id: e.id,
      title: e.title.trim(),
      time: timeLabel(e),
      done: e.is_done,
      color: e.color,
    }))
    .filter((i) => i.title !== '')
  return items.length > 0 ? { dateKey, items } : null
}

/** Ngày mai trả null nếu user đã ẩn nhắc của ĐÚNG ngày đó (ẩn ngày khác không tính). */
export function buildAgenda(
  eventsForDate: (dateKey: string) => AgendaEvent[],
  todayKey: string,
  tomorrowKey: string,
  dismissedTomorrowKey: string | null,
): Agenda {
  return {
    today: dayOf(todayKey, eventsForDate(todayKey)),
    tomorrow:
      dismissedTomorrowKey === tomorrowKey ? null : dayOf(tomorrowKey, eventsForDate(tomorrowKey)),
  }
}

export function agendaChip(agenda: Agenda): AgendaChip | null {
  const { today, tomorrow } = agenda
  if (today) {
    return {
      tone: 'today',
      dateKey: today.dateKey,
      titles: today.items.map((i) => i.title),
      tomorrowCount: tomorrow?.items.length ?? 0,
    }
  }
  if (tomorrow) {
    return {
      tone: 'tomorrow',
      dateKey: tomorrow.dateKey,
      titles: tomorrow.items.map((i) => i.title),
      tomorrowCount: 0,
    }
  }
  return null
}
