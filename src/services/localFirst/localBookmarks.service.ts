import { localStore } from './localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type { LocalBookmark } from '@/types/localFirst'
import type { BookmarkNode } from '@/types/bookmark'

const KEY = LOCAL_STORAGE_KEYS.bookmarks

export const localBookmarksService = {
  async listBackups(): Promise<LocalBookmark[]> {
    const arr = await localStore.getArray<LocalBookmark>(KEY)
    return [...arr].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20)
  },

  async saveBackup(tree: BookmarkNode[], label?: string): Promise<LocalBookmark> {
    const now = new Date().toISOString()
    const browserHint = navigator.userAgent.includes('Edg')
      ? 'edge'
      : navigator.userAgent.includes('Chrome')
        ? 'chrome'
        : 'other'

    const backup: LocalBookmark = {
      id: crypto.randomUUID(),
      label: label ?? new Date().toLocaleString('sv'),
      tree_json: tree,
      browser_hint: browserHint,
      created_at: now,
      encrypted: false,
      __synced: false,
    }

    await localStore.pushItem(KEY, backup)
    return backup
  },

  async deleteBackup(id: string): Promise<void> {
    const arr = await localStore.getArray<LocalBookmark>(KEY)
    await localStore.setArray(
      KEY,
      arr.filter((b) => b.id !== id),
    )
  },

  async pendingSyncCount(): Promise<number> {
    const arr = await this.listBackups()
    return arr.filter((b) => !b.__synced).length
  },
}
