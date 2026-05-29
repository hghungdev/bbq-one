import { supabase } from '@/services/supabase'
import { recoverSupabaseAuthFromStaleSession } from '@/services/supabaseAuthRecovery.service'
import { isOnline } from '@/services/networkReachability.service'
import { BBQ_AUTH_LOGGED_IN_KEY } from '@/constants/storage'

/** Cờ cache trạng thái logged-in để tránh gọi Supabase khi offline (getSession có thể
 *  trigger token refresh sang network và hang). Ghi/xóa qua auth store. */
async function readCachedLoggedInFlag(): Promise<boolean> {
  try {
    const r = await chrome.storage.local.get(BBQ_AUTH_LOGGED_IN_KEY)
    return !!r[BBQ_AUTH_LOGGED_IN_KEY]
  } catch {
    return false
  }
}

/**
 * Check if user is authenticated (has active Supabase session).
 * Used by all dual-mode services to decide where to read/write.
 *
 * Offline policy: KHÔNG gọi Supabase.auth.getSession() vì nó có thể trigger
 * token refresh đi network → hang. Đọc cờ cache (set bởi auth store khi
 * login/logout) để biết user có logged-in trước khi mất mạng hay không.
 */
export async function isAuthenticated(): Promise<boolean> {
  if (!isOnline()) {
    return readCachedLoggedInFlag()
  }
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    await recoverSupabaseAuthFromStaleSession(error)
    return false
  }
  return !!data.session
}

/** Get current user id, throwing if not logged in. Chỉ dùng cho ghi xuống cloud — gọi
 *  hàm này khi đã online; offline path không nên động vào getCurrentUserId. */
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error) {
    await recoverSupabaseAuthFromStaleSession(error)
    throw new Error('Not authenticated')
  }
  const id = session?.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
}
