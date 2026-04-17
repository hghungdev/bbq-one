export interface Note {
  id: string
  user_id: string
  folder_id: string | null
  title: string
  content: string
  tags: string[]
  synced_at: string | null
  updated_at: string
  created_at: string
}

export interface Folder {
  id: string
  user_id: string
  name: string
  position: number
  created_at: string
  updated_at: string
  /** Folder bảo vệ: title/content note mã hóa AES-GCM (salt PBKDF2 trên folders). */
  is_secure: boolean
  /** Base64 của 16 byte CSPRNG; có thể public trong DB. */
  secure_salt: string | null
  pbkdf2_iterations: number
  /** Sentinel mã hóa để kiểm tra passphrase khi chưa có note. */
  secure_verifier_enc: string | null
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'
