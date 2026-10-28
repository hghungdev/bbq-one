import type { CalendarEvent } from '@/types/calendar'
import { todayLocalKey } from '@/utils/calendarDate'

export interface OverdueCalendarDayGroup {
  dateKey: string
  events: CalendarEvent[]
}

/** Sự kiện quá hạn (ngày < hôm nay) và chưa đánh dấu hoàn thành. */
export function listOverdueIncompleteEvents(events: CalendarEvent[]): CalendarEvent[] {
  const today = todayLocalKey()
  return events
    .filter((e) => !e.is_done && e.event_date < today)
    .slice()
    .sort(
      (a, b) =>
        a.event_date.localeCompare(b.event_date) || a.position - b.position,
    )
}

export function groupOverdueIncompleteEvents(
  events: CalendarEvent[],
): OverdueCalendarDayGroup[] {
  const map = new Map<string, CalendarEvent[]>()
  for (const ev of listOverdueIncompleteEvents(events)) {
    const list = map.get(ev.event_date) ?? []
    list.push(ev)
    map.set(ev.event_date, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayEvents]) => ({
      dateKey,
      events: dayEvents.slice().sort((a, b) => a.position - b.position),
    }))
}
