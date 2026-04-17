import { createClient } from '@supabase/supabase-js'
import { chromeSessionStorageAdapter } from '@/utils/storage'

const SUPABASE_URL = (
  import.meta.env.VITE_SUPABASE_URL as string | undefined
)?.trim() ?? ''
const SUPABASE_ANON_KEY = (
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
)?.trim() ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const msg =
    '[BBQNote] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and set values.'
  if (import.meta.env.PROD) {
    throw new Error(msg)
  }
  console.warn(msg)
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    storage: chromeSessionStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
  },
})
