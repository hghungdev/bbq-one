import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { BOOKMARKS_CACHE_KEY } from '@/constants/storage'
import { bookmarksService } from '@/services/bookmarks.service'
import { isOnline } from '@/services/networkReachability.service'
import { useUndoToastStore } from '@/stores/undoToast'
import { useLangStore } from '@/stores/uiLang'
import type { BookmarkBackup, BookmarkNode } from '@/types/bookmark'
import { isNetworkError } from '@/utils/networkErrors'

export const useBookmarksStore = defineStore('bookmarks', () => {
  const liveTree = ref<BookmarkNode[]>([])
  const backups = ref<BookmarkBackup[]>([])
  const selectedBackupId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastBackupAt = ref<string | null>(null)
  /** Chuỗi lọc tree (đồng bộ với SearchBar khi tab BOOKMARK). */
  const searchQuery = ref('')

  const selectedBackup = computed(
    () => backups.value.find(b => b.id === selectedBackupId.value) ?? null
  )

  async function hydrateBackupsFromCache(): Promise<boolean> {
    try {
      const cached = await chrome.storage.local.get(BOOKMARKS_CACHE_KEY)
      const raw = cached[BOOKMARKS_CACHE_KEY] as BookmarkBackup[] | undefined
      if (Array.isArray(raw)) {
        backups.value = raw
        return raw.length > 0
      }
    } catch {
      /* chrome.storage optional in tests */
    }
    return false
  }

  async function persistBackupsCache(): Promise<void> {
    try {
      await chrome.storage.local.set({ [BOOKMARKS_CACHE_KEY]: backups.value })
    } catch {
      /* ignore */
    }
  }

  /** Gán lỗi thân thiện — không hiện "Failed to fetch" khi offline (banner đã giải thích). */
  function setErrorFromCaught(e: unknown, offlineSilent = false): void {
    if (offlineSilent && (!isOnline() || isNetworkError(e))) {
      error.value = null
      return
    }
    const { t } = useLangStore()
    if (isNetworkError(e)) {
      error.value = t('bookmark.errorOfflineCloud')
      return
    }
    error.value = e instanceof Error ? e.message : String(e)
  }

  /** Load bookmark từ Chrome (live) — không cần mạng. */
  async function loadLive(): Promise<void> {
    loading.value = true
    try {
      liveTree.value = await bookmarksService.getFromBrowser()
      error.value = null
    } catch (e) {
      setErrorFromCaught(e)
    } finally {
      loading.value = false
    }
  }

  /** Load danh sách backup từ Supabase; offline dùng cache, không báo lỗi mạng thô. */
  async function loadBackups(): Promise<void> {
    loading.value = true
    try {
      if (!isOnline()) {
        await hydrateBackupsFromCache()
        return
      }
      backups.value = await bookmarksService.listBackups()
      await persistBackupsCache()
    } catch (e) {
      if (isNetworkError(e)) {
        await hydrateBackupsFromCache()
        error.value = null
        return
      }
      setErrorFromCaught(e)
    } finally {
      loading.value = false
    }
  }

  /** Backup live tree lên Supabase */
  async function backup(label?: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const tree = await bookmarksService.getFromBrowser()
      const saved = await bookmarksService.saveBackup(tree, label)
      backups.value.unshift(saved)
      lastBackupAt.value = saved.created_at
      await persistBackupsCache()
    } catch (e) {
      setErrorFromCaught(e)
    } finally {
      loading.value = false
    }
  }

  /** Restore backup được chọn vào Chrome */
  async function restore(backupId: string): Promise<void> {
    const bk = backups.value.find(b => b.id === backupId)
    if (!bk) return
    loading.value = true
    error.value = null
    try {
      await bookmarksService.restoreToChrome(bk.tree_json)
      await loadLive()
    } catch (e) {
      setErrorFromCaught(e)
    } finally {
      loading.value = false
    }
  }

  async function deleteBackup(id: string): Promise<void> {
    const backupIndex = backups.value.findIndex((b) => b.id === id)
    const backup = backupIndex === -1 ? null : {
      ...backups.value[backupIndex],
      tree_json: backups.value[backupIndex].tree_json,
    }
    if (!backup) return
    const prevSelectedBackupId = selectedBackupId.value

    backups.value = backups.value.filter(b => b.id !== id)
    if (selectedBackupId.value === id) selectedBackupId.value = null
    await persistBackupsCache()

    const undoToast = useUndoToastStore()
    const { t } = useLangStore()
    await undoToast.schedule({
      id: `bookmark-backup:${id}`,
      message: t('undo.bookmarkBackupDeleted', { label: backup.label }),
      undo: async () => {
        restoreBackupSnapshot(backup, backupIndex)
        if (selectedBackupId.value === null && prevSelectedBackupId === id) {
          selectedBackupId.value = prevSelectedBackupId
        }
        await persistBackupsCache()
      },
      commit: async () => {
        try {
          await bookmarksService.deleteBackup(id)
        } catch (e) {
          restoreBackupSnapshot(backup, backupIndex)
          if (selectedBackupId.value === null && prevSelectedBackupId === id) {
            selectedBackupId.value = prevSelectedBackupId
          }
          setErrorFromCaught(e)
        }
      },
    })
  }

  function restoreBackupSnapshot(backup: BookmarkBackup, index: number): void {
    if (backups.value.some((b) => b.id === backup.id)) return
    const next = backups.value.slice()
    next.splice(Math.min(Math.max(index, 0), next.length), 0, backup)
    backups.value = next
  }

  function exportHTML(): void {
    bookmarksService.exportAsHTML(liveTree.value)
  }

  function setSearchQuery(q: string): void {
    searchQuery.value = q.trim()
  }

  function clearBookmarkSearch(): void {
    searchQuery.value = ''
  }

  /** Xóa mọi bookmark trên trình duyệt (folder gốc Chromium giữ nguyên). */
  async function deleteAllFromBrowser(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await bookmarksService.deleteAllFromBrowser()
      await loadLive()
    } catch (e) {
      setErrorFromCaught(e)
    } finally {
      loading.value = false
    }
  }

  return {
    liveTree, backups, selectedBackupId, selectedBackup,
    loading, error, lastBackupAt, searchQuery,
    loadLive, loadBackups, backup, restore, deleteBackup, exportHTML,
    setSearchQuery, clearBookmarkSearch, deleteAllFromBrowser,
  }
})
