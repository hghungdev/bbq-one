/** Thời gian tối đa sau lần đăng nhập thành công (10 phút) — hết hạn phải đăng nhập lại. */
export const SESSION_LOGIN_TIMEOUT_MS = 10 * 60 * 1000

/** Lưu trong chrome.storage.session — mất khi đóng trình duyệt. */
export const AUTH_SESSION_DEADLINE_KEY = 'bbqnote_auth_deadline'
