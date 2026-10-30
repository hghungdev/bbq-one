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
    /**
     * N6.1: KHÔNG truyền `lock` (deprecated từ auth-js 2.107, bỏ ở v3) — auth-js tự điều phối refresh token giữa popup /
     * tab / SW: single-flight + commit guard đọc lại kho phiên chung ở trên + máy chủ trả token đang hiệu lực.
     */
  },
})
