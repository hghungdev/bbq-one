/** Biến Vite — dùng cho UI cảnh báo khi chưa build kèm .env */
export const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL as string | undefined
)?.trim() ?? ''

export const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
)?.trim() ?? ''

export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('https://'),
)

export const missingEnvHint: string =
  'Chưa cấu hình Supabase: copy .env.example → .env, điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY, chạy npm run build, rồi Reload extension (chrome://extensions).'
