import { supabase } from './supabase'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type { Folder } from '@/types'

/**
 * SEC-13: đổi khóa thư mục bảo mật (Bật bảo mật / Nâng cấp / Đổi mật khẩu) trong MỘT lần ghi — hoặc xong hết, hoặc không
 * đổi gì. Trước đây ghi từng ghi chú rồi mới ghi salt thư mục → mạng rớt giữa chừng = ghi chú mất vĩnh viễn.
 */
export interface RekeyPayload {
  folderId: string
  /** `secure_salt` hiện tại của thư mục (null khi bật bảo mật lần đầu) — lệch = đã đổi ở máy khác → từ chối. */
  expectedSalt: string | null
  secure: { salt: string; iterations: number; verifier: string }
  /** MỌI ghi chú của thư mục (bản mã mới). */
  notes: { id: string; title: string }[]
  /** MỌI section của các ghi chú đó (bản mã mới). */
  bodies: { id: string; label: string; content: string }[]
}

export interface RekeyRowMeta {
  id: string
  updated_at: string
  synced_at: string | null
}

export interface RekeyResult {
  folder: Folder
  notes: RekeyRowMeta[]
  bodies: RekeyRowMeta[]
}

type LocalRow = { id: string; updated_at?: string; __synced?: boolean } & Record<string, unknown>

async function applyLocal(p: RekeyPayload): Promise<RekeyResult> {
  const keys = [LOCAL_STORAGE_KEYS.folders, LOCAL_STORAGE_KEYS.notes, LOCAL_STORAGE_KEYS.noteBodies]
  const r = await chrome.storage.local.get(keys)
  const arr = (k: string): LocalRow[] => (Array.isArray(r[k]) ? (r[k] as LocalRow[]) : [])
  const folders = arr(LOCAL_STORAGE_KEYS.folders)
  const notes = arr(LOCAL_STORAGE_KEYS.notes)
  const bodies = arr(LOCAL_STORAGE_KEYS.noteBodies)

  const fi = folders.findIndex((f) => f.id === p.folderId)
  if (fi < 0) throw new Error('BBQ_REKEY_NOT_FOUND')
  if ((folders[fi].secure_salt ?? null) !== p.expectedSalt) throw new Error('BBQ_REKEY_STALE: folder salt changed elsewhere')

  const noteIds = new Set(notes.filter((n) => n.folder_id === p.folderId).map((n) => n.id))
  const newTitle = new Map(p.notes.map((n) => [n.id, n.title]))
  const newBody = new Map(p.bodies.map((b) => [b.id, b]))
  if ([...noteIds].some((id) => !newTitle.has(id))) throw new Error('BBQ_REKEY_INCOMPLETE: note(s) missing')
  if (bodies.some((b) => noteIds.has(b.note_id as string) && !newBody.has(b.id))) {
    throw new Error('BBQ_REKEY_INCOMPLETE: note body(ies) missing')
  }

  const now = new Date().toISOString()
  const touched = (row: LocalRow, patch: Record<string, unknown>): LocalRow => ({ ...row, ...patch, updated_at: now, __synced: false })
  const nextNotes = notes.map((n) => (noteIds.has(n.id) ? touched(n, { title: newTitle.get(n.id) }) : n))
  const nextBodies = bodies.map((b) => {
    const nb = newBody.get(b.id)
    return nb && noteIds.has(b.note_id as string) ? touched(b, { label: nb.label, content: nb.content }) : b
  })
  const nextFolders = folders.slice()
  nextFolders[fi] = touched(folders[fi], {
    is_secure: true,
    secure_salt: p.secure.salt,
    pbkdf2_iterations: p.secure.iterations,
    secure_verifier_enc: p.secure.verifier,
  })

  // MỘT lô ghi cho cả ba mảng.
  await chrome.storage.local.set({
    [LOCAL_STORAGE_KEYS.folders]: nextFolders,
    [LOCAL_STORAGE_KEYS.notes]: nextNotes,
    [LOCAL_STORAGE_KEYS.noteBodies]: nextBodies,
  })
  const meta = (row: LocalRow): RekeyRowMeta => ({ id: row.id, updated_at: now, synced_at: (row.synced_at as string | null) ?? null })
  return {
    folder: { ...(nextFolders[fi] as unknown as Folder), user_id: '' },
    notes: nextNotes.filter((n) => noteIds.has(n.id)).map(meta),
    bodies: nextBodies.filter((b) => noteIds.has(b.note_id as string)).map(meta),
  }
}

export const secureRekeyService = {
  async apply(p: RekeyPayload): Promise<RekeyResult> {
    if (await isAuthenticated()) {
      // migration 020 — một giao dịch, khóa dòng thư mục, từ chối salt lệch / thiếu ghi chú.
      const { data, error } = await supabase.rpc('bbq_rekey_secure_folder', {
        p_folder_id: p.folderId,
        p_expected_salt: p.expectedSalt,
        p_salt: p.secure.salt,
        p_iterations: p.secure.iterations,
        p_verifier: p.secure.verifier,
        p_notes: p.notes,
        p_bodies: p.bodies,
      })
      if (error) throw new Error(error.message || 'Rekey failed')
      return data as RekeyResult
    }
    return applyLocal(p)
  },
}
