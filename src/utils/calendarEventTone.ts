/** Số tone pastel — đủ đa dạng, vẫn gọn trong lưới tháng. */
export const CALENDAR_EVENT_TONE_COUNT = 8

/** Màu ổn định theo id — cùng event luôn cùng tone trên mọi ngày/tháng. */
export function calendarEventToneIndex(eventId: string): number {
  let hash = 0
  for (let i = 0; i < eventId.length; i += 1) {
    hash = (Math.imul(31, hash) + eventId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % CALENDAR_EVENT_TONE_COUNT
}

/** Class dùng chung: lưới, modal, search. */
export function calendarEventToneClass(eventId: string): string {
  return `cal-event-tone-${calendarEventToneIndex(eventId)}`
}
