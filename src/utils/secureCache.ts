import { encryptField, encryptFieldV2, isEncryptedEnvelope } from '@/utils/secureCrypto'

/** Hình dạng tối thiểu cần để niêm phong — khớp Note/NoteBody, không phụ thuộc `@/types`. */
export interface SealableNote {
  id: string
  folder_id: string | null
  title: string
}

export interface SealableBody {
  id: string
  note_id: string
  label: string
  content: string
}

export interface SealResult<N, B> {
  notes: N[]
  bodies: B[]
  /** Số row bị loại khỏi bản ghi cache vì còn plaintext mà không có key (nhánh phòng vệ). */
  dropped: number
}

/**
 * S1: `chrome.storage.local` KHÔNG được chứa plaintext của row thuộc secure folder.
 *
 * Trả về BẢN SAO đã niêm phong để ghi xuống đĩa. State RAM (đang hiển thị cho user sau khi
 * unlock) giữ nguyên plaintext và KHÔNG bị mutate — UI phụ thuộc vào điều này.
 *
 * Quy tắc cho row thuộc secure folder:
 *   - đã là envelope        → giữ nguyên (KHÔNG encrypt chồng — sẽ hỏng dữ liệu)
 *   - plaintext + CÓ key    → `encryptField`
 *   - plaintext + KHÔNG key → loại row khỏi bản ghi cache
 *
 * Nhánh cuối là phòng vệ, không đạt tới trong luồng thường (plaintext chỉ xuất hiện khi folder
 * đang unlock, tức luôn có key). Chọn mất một edit chưa sync còn hơn ghi plaintext xuống đĩa.
 */
export async function sealSecureRowsForCache<
  N extends SealableNote,
  B extends SealableBody,
>(input: {
  notes: N[]
  bodies: B[]
  isSecureFolder: (folderId: string | null) => boolean
  getKey: (folderId: string) => CryptoKey | null
  /** S2C1: account-mode UNLOCKED → seal mọi row plaintext NGOÀI secure folder bằng v2.
   *  null/undefined = mode off HOẶC locked → row ngoài secure folder đi qua như cũ
   *  (trạng thái legacy pre-backfill — xem spec). */
  account?: { key: CryptoKey; kid: string } | null
}): Promise<SealResult<N, B>> {
  const { notes, bodies, isSecureFolder, getKey, account } = input

  const folderOfNote = new Map<string, string | null>()
  for (const n of notes) folderOfNote.set(n.id, n.folder_id)

  const droppedNoteIds = new Set<string>()
  const outNotes: N[] = []
  let dropped = 0

  for (const n of notes) {
    const folderId = n.folder_id
    if (!folderId || !isSecureFolder(folderId)) {
      if (account && !isEncryptedEnvelope(n.title)) {
        outNotes.push({ ...n, title: await encryptFieldV2(n.title, account.key, account.kid) })
      } else {
        outNotes.push(n)
      }
      continue
    }
    if (isEncryptedEnvelope(n.title)) {
      outNotes.push(n)
      continue
    }
    const key = getKey(folderId)
    if (!key) {
      droppedNoteIds.add(n.id)
      dropped++
      continue
    }
    outNotes.push({ ...n, title: await encryptField(n.title, key) })
  }

  const outBodies: B[] = []
  for (const b of bodies) {
    if (droppedNoteIds.has(b.note_id)) {
      dropped++
      continue
    }
    const folderId = folderOfNote.get(b.note_id) ?? null
    if (!folderId || !isSecureFolder(folderId)) {
      if (account) {
        const lPlain = !isEncryptedEnvelope(b.label)
        const cPlain = !isEncryptedEnvelope(b.content)
        if (lPlain || cPlain) {
          outBodies.push({
            ...b,
            label: lPlain ? await encryptFieldV2(b.label, account.key, account.kid) : b.label,
            content: cPlain ? await encryptFieldV2(b.content, account.key, account.kid) : b.content,
          })
          continue
        }
      }
      outBodies.push(b)
      continue
    }
    const labelPlain = !isEncryptedEnvelope(b.label)
    const contentPlain = !isEncryptedEnvelope(b.content)
    if (!labelPlain && !contentPlain) {
      outBodies.push(b)
      continue
    }
    const key = getKey(folderId)
    if (!key) {
      dropped++
      continue
    }
    outBodies.push({
      ...b,
      label: labelPlain ? await encryptField(b.label, key) : b.label,
      content: contentPlain ? await encryptField(b.content, key) : b.content,
    })
  }

  return { notes: outNotes, bodies: outBodies, dropped }
}
