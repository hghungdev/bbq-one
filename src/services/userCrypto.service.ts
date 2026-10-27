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

/**
 * `mustNotExist` (S2C1.5 — ceremony bật mã hóa): INSERT, row đã có → lỗi "Already enabled" thay
 * vì đè `wrapped_dek` cũ (đè = mọi ghi chú v2 không giải mã được nữa). Re-wrap (recovery) upsert.
 */
export async function upsertUserCryptoRow(
  row: UserCryptoRow,
  opts: { mustNotExist?: boolean } = {},
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const payload = { user_id: user.id, ...row }
  const { error } = opts.mustNotExist
    ? await supabase.from('user_crypto').insert(payload)
    : await supabase.from('user_crypto').upsert(payload, { onConflict: 'user_id' })
  if (error) throw new Error(error.code === '23505' ? 'Already enabled' : error.message)
}
