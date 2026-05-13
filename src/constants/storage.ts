export const NOTES_CACHE_KEY = 'notes_cache'
/** Bodies tách cache — schema 1 note : N body. */
export const NOTE_BODIES_CACHE_KEY = 'note_bodies_cache'
export const FOLDERS_CACHE_KEY = 'folders_cache'
export const LAST_SYNC_KEY = 'last_sync'
export const BOOKMARKS_CACHE_KEY = 'bookmarks_cache'
export const ACTIVE_TAB_KEY = 'active_tab'
/** SHA-256 hex của tree bookmark đã sync lên Supabase lần cuối (manual hoặc auto). */
export const BOOKMARK_LAST_TREE_HASH_KEY = 'bookmark_last_tree_hash'

export const DICTIONARY_CACHE_KEY = 'dictionary_cache'
export const TRANSLATION_SETTINGS_CACHE_KEY = 'translation_settings_cache'

/** Chuột phải icon → mở popup tới route này (login hoặc dashboard). */
export const BBQ_PENDING_ROUTE_KEY = 'bbq_pending_route'
/** True: click icon mở Quick Translate; False/missing: vào Dashboard. Mặc định không lưu = false. */
export const BBQ_ICON_QUICK_TRANSLATE_ACTIVE_KEY = 'bbqone_icon_quick_translate_active'
/** Đồng bộ với background để đổi nhãn context menu (Login vs Dashboard). */
export const BBQ_AUTH_LOGGED_IN_KEY = 'bbq_auth_logged_in'

/** Ngôn ngữ giao diện người dùng đã chọn ('en' | 'vi'). */
export const UI_LANG_KEY = 'ui_lang'

/**
 * Bật/tắt MyMemory provider (true = dùng MyMemory, false = Chrome built-in only).
 * Lưu ở chrome.storage.local để truy cập được từ mọi context (background + popup).
 * Default: true khi key không tồn tại.
 */
export const USE_MYMEMORY_KEY = 'bbqone_use_mymemory'

/** Cài đặt translation (native/learning/use_mymemory) khi chưa đăng nhập — chỉ local. */
export const ANON_TRANSLATION_SETTINGS_KEY = 'bbqone_anon_translation_settings'
