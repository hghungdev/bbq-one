import { BBQ_AUTH_LOGGED_IN_KEY } from '@/constants/storage'
import { clearLoginDeadline } from '@/services/auth.service'
import { supabase } from '@/services/supabase'

/**
 * Session/refresh lỗi từ GoTrue — dọn storage cục bộ để tránh crash overlay (MV3 popup + SW).
 * Business: user cần đăng nhập lại khi refresh token không còn hợp lệ.
 */
export function isRecoverableRefreshTokenAuthError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { name?: string; message?: string; code?: string }
  const msg = String(e.message ?? '').toLowerCase()
  const code = String(e.code ?? '').toLowerCase()
  if (code === 'refresh_token_not_found' || code === 'invalid_refresh_token') return true
  return (
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    msg.includes('refresh_token_not_found')
  )
}

/** Trả về true nếu đã xử lý (đã sign out cục bộ). */
export async function recoverSupabaseAuthFromStaleSession(
  error: unknown,
): Promise<boolean> {
  if (!isRecoverableRefreshTokenAuthError(error)) return false
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    /* ignore */
  }
  try {
    await clearLoginDeadline()
  } catch {
    /* ignore */
  }
  try {
    await chrome.storage.local.set({ [BBQ_AUTH_LOGGED_IN_KEY]: false })
  } catch {
    /* ignore */
  }
  return true
}
