import { BBQ_NOTE_DRAFT_SESSION_KEY } from '@/constants/storage'

export interface NoteEditorDraft {
  bodyId: string
  noteId: string
  content: string
  /** ISO — thời điểm keystroke cuối (client clock, ms). */
  at: string
  /**
   * N12: updated_at của body TẠI THỜI ĐIỂM gõ (timestamp server từ cache).
   * Baseline khớp = body chưa đổi từ lúc gõ → draft chắc chắn mới hơn, miễn nhiễm clock skew.
   * Optional để draft legacy (bản cũ) vẫn đọc được.
   */
  baselineUpdatedAt?: string
}

function isValidDraft(raw: unknown): raw is NoteEditorDraft {
  if (typeof raw !== 'object' || raw === null) return false
  const d = raw as Record<string, unknown>
  return (
    typeof d.bodyId === 'string' && d.bodyId.length > 0
    && typeof d.noteId === 'string'
    && typeof d.content === 'string'
    && typeof d.at === 'string' && d.at.length > 0
    && (d.baselineUpdatedAt === undefined || typeof d.baselineUpdatedAt === 'string')
  )
}

export async function saveNoteDraft(draft: NoteEditorDraft): Promise<void> {
  try {
    await chrome.storage.session.set({ [BBQ_NOTE_DRAFT_SESSION_KEY]: draft })
  } catch {
    /* best-effort */
  }
}

export async function readNoteDraft(): Promise<NoteEditorDraft | null> {
  try {
    const chunk = await chrome.storage.session.get(BBQ_NOTE_DRAFT_SESSION_KEY)
    const raw = chunk[BBQ_NOTE_DRAFT_SESSION_KEY]
    return isValidDraft(raw) ? raw : null
  } catch {
    return null
  }
}

export async function clearNoteDraft(): Promise<void> {
  try {
    await chrome.storage.session.remove(BBQ_NOTE_DRAFT_SESSION_KEY)
  } catch {
    /* best-effort */
  }
}

/**
 * Chỉ áp draft khi body đích còn tồn tại VÀ draft mới hơn bản trong cache.
 * So sánh ms qua Date là đủ (draft.at và updated_at local đều ms; updated_at server µs
 * chỉ chênh dưới-ms — draft thật sự mới hơn thì luôn cách xa hơn thế).
 */
export function shouldApplyDraft(
  draft: NoteEditorDraft,
  body: { id: string; updated_at: string } | null | undefined,
): boolean {
  if (!body || body.id !== draft.bodyId) return false
  // N12: body chưa đổi từ lúc gõ draft → draft là bản mới nhất, bất kể đồng hồ client lệch bao nhiêu.
  if (draft.baselineUpdatedAt && draft.baselineUpdatedAt === body.updated_at) return true
  // Body đã đổi (save khác / máy khác thắng) hoặc draft legacy → heuristic thời gian như cũ.
  return new Date(draft.at).getTime() > new Date(body.updated_at).getTime()
}
