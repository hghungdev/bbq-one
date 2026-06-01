import { BBQ_PENDING_DELETE_COMMITS_KEY } from '@/constants/storage'
import { bookmarksService } from '@/services/bookmarks.service'
import { calendarEventsService } from '@/services/calendarEvents.service'
import { notesService } from '@/services/notes.service'

export type PendingDeleteKind = 'note' | 'calendar' | 'bookmark-backup'

export const FLUSH_PENDING_DELETES_MESSAGE = 'bbq-flush-pending-deletes' as const

export function isFlushPendingDeletesMessage(
  msg: unknown,
): msg is { type: typeof FLUSH_PENDING_DELETES_MESSAGE } {
  return (
    typeof msg === 'object'
    && msg !== null
    && (msg as { type?: string }).type === FLUSH_PENDING_DELETES_MESSAGE
  )
}

/** Popup đóng — SW sống lâu hơn popup, kịp gọi API xóa trên server. */
export function requestBackgroundFlushPendingDeletes(): void {
  void chrome.runtime
    .sendMessage({ type: FLUSH_PENDING_DELETES_MESSAGE })
    .catch(() => {})
}

/** Parse id từ undoToast.schedule — `note:uuid`, `calendar:uuid`, `bookmark-backup:uuid`. */
export function parseUndoDeleteActionId(
  actionId: string,
): { kind: PendingDeleteKind; entityId: string } | null {
  const note = actionId.startsWith('note:')
  const calendar = actionId.startsWith('calendar:')
  const bookmark = actionId.startsWith('bookmark-backup:')
  if (note) return { kind: 'note', entityId: actionId.slice('note:'.length) }
  if (calendar) return { kind: 'calendar', entityId: actionId.slice('calendar:'.length) }
  if (bookmark) return { kind: 'bookmark-backup', entityId: actionId.slice('bookmark-backup:'.length) }
  return null
}

async function readQueue(): Promise<string[]> {
  try {
    const chunk = await chrome.storage.local.get(BBQ_PENDING_DELETE_COMMITS_KEY)
    const raw = chunk[BBQ_PENDING_DELETE_COMMITS_KEY]
    if (!Array.isArray(raw)) return []
    return raw.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

async function writeQueue(ids: string[]): Promise<void> {
  try {
    if (ids.length === 0) {
      await chrome.storage.local.remove(BBQ_PENDING_DELETE_COMMITS_KEY)
      return
    }
    await chrome.storage.local.set({ [BBQ_PENDING_DELETE_COMMITS_KEY]: ids })
  } catch {
    /* ignore */
  }
}

/** Ghi nhận xóa đang chờ undo — survive khi popup đóng đột ngột. */
export async function registerPendingDeleteCommit(actionId: string): Promise<void> {
  const queue = await readQueue()
  if (!queue.includes(actionId)) {
    await writeQueue([...queue, actionId])
  }
}

export async function unregisterPendingDeleteCommit(actionId: string): Promise<void> {
  const queue = await readQueue()
  const next = queue.filter((id) => id !== actionId)
  if (next.length !== queue.length) await writeQueue(next)
}

async function executePendingDelete(actionId: string): Promise<void> {
  const parsed = parseUndoDeleteActionId(actionId)
  if (!parsed) return
  switch (parsed.kind) {
    case 'note':
      await notesService.delete(parsed.entityId)
      break
    case 'calendar':
      await calendarEventsService.delete(parsed.entityId)
      break
    case 'bookmark-backup':
      await bookmarksService.deleteBackup(parsed.entityId)
      break
    default:
      break
  }
}

/**
 * Xóa thật các entry còn trong queue (popup đã đóng trước khi hết 5s).
 * Gọi khi mở popup lần sau hoặc từ background.
 */
export async function flushOrphanedPendingDeleteCommits(): Promise<void> {
  const queue = await readQueue()
  if (queue.length === 0) return

  const remaining: string[] = []
  for (const actionId of queue) {
    try {
      await executePendingDelete(actionId)
    } catch (e) {
      console.warn('[BBQOne] Pending delete flush failed:', actionId, e)
      remaining.push(actionId)
    }
  }
  await writeQueue(remaining)
}
