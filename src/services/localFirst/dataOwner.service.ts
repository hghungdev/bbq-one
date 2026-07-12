import {
  BBQ_DATA_OWNER_USER_ID_KEY,
  BBQ_FOREIGN_STASH_KEY,
  BBQ_PENDING_DELETE_COMMITS_KEY,
  BOOKMARKS_CACHE_KEY,
  FOLDERS_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  NOTES_CACHE_KEY,
} from '@/constants/storage'
import { CALENDAR_EVENTS_CACHE_KEY } from '@/constants/calendar'
import { BBQ_CONFLICT_BACKUPS_KEY } from '@/utils/syncConflict'
import { localStore } from './localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type {
  LocalBookmark,
  LocalCalendarEvent,
  LocalFolder,
  LocalNote,
  LocalNoteBody,
} from '@/types/localFirst'

export interface ForeignStash {
  stashedAt: string
  notes: LocalNote[]
  noteBodies: LocalNoteBody[]
  folders: LocalFolder[]
  bookmarks: LocalBookmark[]
  calendarEvents: LocalCalendarEvent[]
}

export interface OwnershipCheckResult {
  status: 'first-login' | 'same-owner' | 'foreign-stashed'
  /** true = stash của CHÍNH user này (từ lần bị đổi account trước) đã được trả về bbqone_local_*. */
  restoredOwnStash: boolean
}

/** Cache account-scoped bị purge khi đổi owner (KHÔNG gồm theme/lang/tab — đó là per-device). */
const ACCOUNT_SCOPED_KEYS = [
  NOTES_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  FOLDERS_CACHE_KEY,
  CALENDAR_EVENTS_CACHE_KEY,
  BOOKMARKS_CACHE_KEY,
  BBQ_PENDING_DELETE_COMMITS_KEY,
  BBQ_CONFLICT_BACKUPS_KEY,
]

async function readStashMap(): Promise<Record<string, ForeignStash>> {
  const chunk = await chrome.storage.local.get(BBQ_FOREIGN_STASH_KEY)
  const raw = chunk[BBQ_FOREIGN_STASH_KEY]
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, ForeignStash>) : {}
}

/** Append entries chưa có id trùng vào local-first store. */
async function restoreArray<T extends { id: string }>(key: string, entries: T[]): Promise<void> {
  if (entries.length === 0) return
  const current = await localStore.getArray<T>(key)
  const existing = new Set(current.map((e) => e.id))
  const merged = [...current, ...entries.filter((e) => !existing.has(e.id))]
  await localStore.setArray(key, merged)
}

async function restoreOwnStash(userId: string): Promise<boolean> {
  const stashMap = await readStashMap()
  const stash = stashMap[userId]
  if (!stash) return false
  await restoreArray(LOCAL_STORAGE_KEYS.folders, stash.folders ?? [])
  await restoreArray(LOCAL_STORAGE_KEYS.notes, stash.notes ?? [])
  await restoreArray(LOCAL_STORAGE_KEYS.noteBodies, stash.noteBodies ?? [])
  await restoreArray(LOCAL_STORAGE_KEYS.bookmarks, stash.bookmarks ?? [])
  await restoreArray(LOCAL_STORAGE_KEYS.calendarEvents, stash.calendarEvents ?? [])
  delete stashMap[userId]
  await chrome.storage.local.set({ [BBQ_FOREIGN_STASH_KEY]: stashMap })
  return true
}

const notSynced = <T extends { __synced?: boolean }>(arr: T[]): T[] =>
  arr.filter((e) => !e.__synced)

/**
 * Gọi khi SIGNED_IN, TRƯỚC mọi push. Đảm bảo local data thuộc đúng user hiện tại:
 * - owner null (anonymous/fresh) → nhận owner, push như cũ (onboarding local-first giữ nguyên).
 * - owner === user → như cũ (kèm restore stash nếu có).
 * - owner !== user → stash phần chưa-sync của owner cũ, PURGE cache/local/queue/backups,
 *   nhận owner mới, restore stash của user mới nếu có.
 */
export async function ensureLocalDataOwnership(
  currentUserId: string,
): Promise<OwnershipCheckResult> {
  const chunk = await chrome.storage.local.get(BBQ_DATA_OWNER_USER_ID_KEY)
  const owner = (chunk[BBQ_DATA_OWNER_USER_ID_KEY] as string | undefined) ?? null

  if (owner === null || owner === currentUserId) {
    const restoredOwnStash = await restoreOwnStash(currentUserId)
    await chrome.storage.local.set({ [BBQ_DATA_OWNER_USER_ID_KEY]: currentUserId })
    return { status: owner === null ? 'first-login' : 'same-owner', restoredOwnStash }
  }

  // owner !== currentUserId → quarantine phần chưa-sync của owner cũ
  const [notes, noteBodies, folders, bookmarks, calendarEvents] = await Promise.all([
    localStore.getArray<LocalNote>(LOCAL_STORAGE_KEYS.notes),
    localStore.getArray<LocalNoteBody>(LOCAL_STORAGE_KEYS.noteBodies),
    localStore.getArray<LocalFolder>(LOCAL_STORAGE_KEYS.folders),
    localStore.getArray<LocalBookmark>(LOCAL_STORAGE_KEYS.bookmarks),
    localStore.getArray<LocalCalendarEvent>(LOCAL_STORAGE_KEYS.calendarEvents),
  ])
  const stashMap = await readStashMap()
  stashMap[owner] = {
    stashedAt: new Date().toISOString(),
    notes: notSynced(notes),
    noteBodies: notSynced(noteBodies),
    folders: notSynced(folders),
    bookmarks: notSynced(bookmarks),
    calendarEvents: notSynced(calendarEvents),
  }
  await chrome.storage.local.set({ [BBQ_FOREIGN_STASH_KEY]: stashMap })

  // PURGE: local-first store + cache account-scoped + queue + conflict backups
  await localStore.clearAllLocal()
  await chrome.storage.local.remove(ACCOUNT_SCOPED_KEYS)

  await chrome.storage.local.set({ [BBQ_DATA_OWNER_USER_ID_KEY]: currentUserId })
  const restoredOwnStash = await restoreOwnStash(currentUserId)
  return { status: 'foreign-stashed', restoredOwnStash }
}

/**
 * N3.1: guard tại-thời-điểm-push cho MỌI đường push (autoSync alarm, network-restore,
 * manual sync, post-login). true = được phép push local data dưới user này:
 * owner null (anonymous onboarding) hoặc owner === currentUserId.
 */
export async function isPushAllowedFor(currentUserId: string | null): Promise<boolean> {
  if (!currentUserId) return false
  const chunk = await chrome.storage.local.get(BBQ_DATA_OWNER_USER_ID_KEY)
  const owner = (chunk[BBQ_DATA_OWNER_USER_ID_KEY] as string | undefined) ?? null
  return owner === null || owner === currentUserId
}
