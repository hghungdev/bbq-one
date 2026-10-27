import { supabase } from './supabase'

export interface UserCryptoRow {
  kdf: string
  kdf_params: { iterations: number }
  kdf_salt: string
  dek_id: string
  wrapped_dek: string
  wrapped_dek_recovery: string | null
  verifier: string
}

/**
 * S2C1.3: trạng thái kèm user id (store cache nó theo user vào chrome.storage.session).
 * null = chưa đăng nhập; `row: null` = user chưa bật encrypted account.
 * Không kiểm tra được (mạng, token) → throw.
 */
export async function fetchUserCryptoStatus(): Promise<{
  userId: string
  row: UserCryptoRow | null
} | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (!user) {
    // Chỉ "không có session" mới là null hợp lệ. Lỗi mạng mà trả null → caller tưởng account
    // chưa bật mã hóa → ghi/push plaintext.
    if (authError && authError.name !== 'AuthSessionMissingError') {
      throw new Error(authError.message)
    }
    return null
  }
  const { data, error } = await supabase
    .from('user_crypto')
    .select('kdf, kdf_params, kdf_salt, dek_id, wrapped_dek, wrapped_dek_recovery, verifier')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return { userId: user.id, row: data ? (data as UserCryptoRow) : null }
}

/** null = user chưa bật encrypted account. Không kiểm tra được (mạng, token) → throw. */
export async function fetchUserCryptoRow(): Promise<UserCryptoRow | null> {
  return (await fetchUserCryptoStatus())?.row ?? null
}

export async function upsertUserCryptoRow(row: UserCryptoRow): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase.from('user_crypto').upsert(
    { user_id: user.id, ...row },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(error.message)
}
