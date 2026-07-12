import { createClient } from '@supabase/supabase-js'
import { chromeSessionStorageAdapter } from '@/utils/storage'
import { supabaseAuthLock } from '@/utils/webLock'

const SUPABASE_URL = (
  import.meta.env.VITE_SUPABASE_URL as string | undefined
)?.trim() ?? ''
const SUPABASE_ANON_KEY = (
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
)?.trim() ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const msg =
    '[BBQOne] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and set values.'
  if (import.meta.env.PROD) {
    throw new Error(msg)
  }
  console.warn(msg)
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    /** Extension không có OAuth redirect URL — tránh GoTrue parse hash/query sai. */
    detectSessionInUrl: false,
    storage: chromeSessionStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    /** N6: popup + SW chung 1 Web Lock khi refresh token — hết race rotate refresh token. */
    lock: supabaseAuthLock,
  },
})
