export const NOTES_CACHE_KEY = 'notes_cache'
/** Bodies tách cache — schema 1 note : N body. */
export const NOTE_BODIES_CACHE_KEY = 'note_bodies_cache'
export const FOLDERS_CACHE_KEY = 'folders_cache'
export const LAST_SYNC_KEY = 'last_sync'
export const BOOKMARKS_CACHE_KEY = 'bookmarks_cache'
export const ACTIVE_TAB_KEY = 'active_tab'
/** SHA-256 hex của tree bookmark đã sync lên Supabase lần cuối (manual hoặc auto). */
export const BOOKMARK_LAST_TREE_HASH_KEY = 'bookmark_last_tree_hash'

/** Chuột phải icon → mở popup tới route này (login hoặc dashboard). */
export const BBQ_PENDING_ROUTE_KEY = 'bbq_pending_route'
/** Đồng bộ với background để đổi nhãn context menu (Login vs Dashboard). */
export const BBQ_AUTH_LOGGED_IN_KEY = 'bbq_auth_logged_in'

/** Ngôn ngữ giao diện người dùng đã chọn ('en' | 'vi'). */
export const UI_LANG_KEY = 'ui_lang'

/** Theme popup: 'light' | 'dark' — đồng bộ chrome.storage.local, áp vào html[data-theme]. */
export const BBQ_UI_THEME_KEY = 'bbqone_ui_theme'

/** Lệch giờ app so với UTC (số nguyên −12…+14). Mặc định 0 = UTC+0. */
export const BBQ_UTC_OFFSET_HOURS_KEY = 'bbqone_utc_offset_hours'

/**
 * chrome.storage.session: ngày (YYYY-MM-DD) của banner “1 ngày trước” user đã đóng.
 * Xóa khi SIGNED_IN để banner hiện lại sau lần đăng nhập tiếp theo.
 */
export const CALENDAR_UPCOMING_BANNER_DISMISSED_SESSION_KEY =
  'bbqone_calendar_upcoming_banner_dismissed'

/**
 * chrome.storage.session: user đã đóng popup nhắc event quá hạn trong phiên đăng nhập.
 * Xóa khi SIGNED_IN — hiện lại sau lần đăng nhập tiếp theo.
 */
export const CALENDAR_OVERDUE_REMINDER_DISMISSED_SESSION_KEY =
  'bbqone_calendar_overdue_reminder_dismissed'

/** Undo 5s: xóa thật khi đóng popup hoặc flush sau khi context bị kill. */
export const BBQ_PENDING_DELETE_COMMITS_KEY = 'bbqone_pending_delete_commits'
