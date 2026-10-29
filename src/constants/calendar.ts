export const CALENDAR_EVENTS_CACHE_KEY = 'calendar_events_cache'

/** Tiêu đề sự kiện — khớp CHECK Postgres + `CalendarEventModal` / maxlength. */
export const CALENDAR_TITLE_MAX = 64
export const CALENDAR_DESCRIPTION_MAX = 5000

/** Hard cap: số sự kiện tối đa trên một ngày (DATE) — không được vượt khi tạo mới (U30: 3 → 6) */
export const CALENDAR_MAX_EVENTS_PER_DAY = 6

/** U30: số pill vẽ trong ô (ô chỉ đủ chỗ 2 dòng) — còn lại là nút "+n xem thêm" mở hộp của ngày */
export const CALENDAR_CELL_EVENT_LIMIT = 2
