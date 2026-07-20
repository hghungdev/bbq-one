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

/** null = user chưa bật encrypted account. */
export async function fetchUserCryptoRow(): Promise<UserCryptoRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('user_crypto')
    .select('kdf, kdf_params, kdf_salt, dek_id, wrapped_dek, wrapped_dek_recovery, verifier')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return data as UserCryptoRow
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
