/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Đồng bộ public/manifest.json — inject trong vite.config.ts */
  readonly VITE_EXTENSION_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
