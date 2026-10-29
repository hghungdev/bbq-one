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

/**
 * chrome.storage.session: ngày (YYYY-MM-DD) của banner “1 ngày trước” user đã đóng.
 * Xóa khi SIGNED_IN để banner hiện lại sau lần đăng nhập tiếp theo.
 */
export const CALENDAR_UPCOMING_BANNER_DISMISSED_SESSION_KEY =
  'bbqone_calendar_upcoming_banner_dismissed'

/** Undo 5s: xóa thật khi đóng popup hoặc flush sau khi context bị kill. */
export const BBQ_PENDING_DELETE_COMMITS_KEY = 'bbqone_pending_delete_commits'

/**
 * chrome.storage.session: draft nội dung NoteEditor (1 slot) — lưới đỡ khi popup bị kill
 * trước khi debounce-save 2s kịp chạy. Khôi phục + xóa ở lần mở popup sau.
 */
export const BBQ_NOTE_DRAFT_SESSION_KEY = 'bbqone_note_editor_draft'

/** User id sở hữu local data hiện tại (cache + bbqone_local_*). null/absent = anonymous/chưa từng login. */
export const BBQ_DATA_OWNER_USER_ID_KEY = 'bbqone_data_owner_user_id'
/** Quarantine data chưa-sync của owner cũ khi user KHÁC đăng nhập: Record<userId, ForeignStash>. */
export const BBQ_FOREIGN_STASH_KEY = 'bbqone_foreign_stash_v1'

/** B1: trạng thái sao lưu ra file — công tắc tự động, lần sao lưu gần nhất + dấu SHA-256, ngày đã kiểm, lần khôi phục. */
export const BBQ_BACKUP_STATE_KEY = 'bbqone_backup_state'
/** B1: đổi mỗi lần khôi phục từ file — trang BBQOne khác đang mở thấy thì tải lại (RAM cũ không được ghi đè). */
export const BBQ_RESTORE_EPOCH_KEY = 'bbqone_restore_epoch'
