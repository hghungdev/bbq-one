export const CALENDAR_EVENTS_CACHE_KEY = 'calendar_events_cache'

/** Title input hard limit — DB constraint mirror */
export const CALENDAR_TITLE_MAX = 200
export const CALENDAR_DESCRIPTION_MAX = 5000

/** Hard cap: số sự kiện tối đa trên một ngày (DATE) — không được vượt khi tạo mới */
export const CALENDAR_MAX_EVENTS_PER_DAY = 3

/** Giới hạn hiển thị pill trong ô trước khi hiện "+N" (khớp tối đa mỗi ngày) */
export const CALENDAR_CELL_EVENT_LIMIT = CALENDAR_MAX_EVENTS_PER_DAY
