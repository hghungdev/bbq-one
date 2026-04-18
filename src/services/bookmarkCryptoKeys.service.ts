import { supabase } from './supabase'

export interface BookmarkCryptoRow {
  salt: string
  verifier_iv: string
  verifier_ct: string
}

/** Có cấu hình PIN bookmark trên server (user đã đặt PIN). */
export async function fetchBookmarkCryptoRow(): Promise<BookmarkCryptoRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('bookmark_crypto')
    .select('salt, verifier_iv, verifier_ct')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return data as BookmarkCryptoRow
}

export async function upsertBookmarkCryptoSetup(
  salt: string,
  verifierIv: string,
  verifierCt: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase.from('bookmark_crypto').upsert(
    {
      user_id: user.id,
      salt,
      verifier_iv: verifierIv,
      verifier_ct: verifierCt,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(error.message)
}
