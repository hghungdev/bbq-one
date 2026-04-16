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
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'
