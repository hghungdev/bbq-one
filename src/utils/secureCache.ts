import { decryptField, encryptField, encryptFieldV2, isEncryptedEnvelope } from '@/utils/secureCrypto'

/**
 * S2C1.2: nhớ bản mã đã biết theo (key, row, field) — chỉ RAM, GC dọn khi key bị bỏ.
 * persistCache chạy mỗi autosave; không nhớ thì mỗi lần lưu mã hóa lại MỌI row (~70 µs/lệnh
 * WebCrypto → 2.000 note ≈ 0,86 s). Nhớ theo row chứ không theo plaintext: hai row trùng nội
 * dung vẫn ra hai bản mã khác nhau.
 */
const sealMemo = new WeakMap<CryptoKey, Map<string, { plain: string; env: string }>>()

function memoFor(key: CryptoKey): Map<string, { plain: string; env: string }> {
  let memo = sealMemo.get(key)
  if (!memo) {
    memo = new Map()
    sealMemo.set(key, memo)
  }
  return memo
}

export const sealMemoId = {
  noteTitle: (id: string): string => `n:${id}:title`,
  bodyLabel: (id: string): string => `b:${id}:label`,
  bodyContent: (id: string): string => `b:${id}:content`,
}

async function sealField(
  key: CryptoKey,
  memoId: string,
  plain: string,
  encrypt: () => Promise<string>,
): Promise<string> {
  const memo = memoFor(key)
  const known = memo.get(memoId)
  if (known && known.plain === plain) return known.env
  const env = await encrypt()
  memo.set(memoId, { plain, env })
  return env
}

/** Mở envelope có nhớ — envelope đã biết thì không giải mã lại; lần seal sau dùng lại nó. */
export async function openSealedField(key: CryptoKey, memoId: string, env: string): Promise<string> {
  const memo = memoFor(key)
  const known = memo.get(memoId)
  if (known && known.env === env) return known.plain
  const plain = await decryptField(env, key)
  memo.set(memoId, { plain, env })
  return plain
}

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
        const title = await sealField(account.key, sealMemoId.noteTitle(n.id), n.title, () =>
          encryptFieldV2(n.title, account.key, account.kid),
        )
        outNotes.push({ ...n, title })
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
    const title = await sealField(key, sealMemoId.noteTitle(n.id), n.title, () =>
      encryptField(n.title, key),
    )
    outNotes.push({ ...n, title })
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
            label: lPlain
              ? await sealField(account.key, sealMemoId.bodyLabel(b.id), b.label, () =>
                  encryptFieldV2(b.label, account.key, account.kid),
                )
              : b.label,
            content: cPlain
              ? await sealField(account.key, sealMemoId.bodyContent(b.id), b.content, () =>
                  encryptFieldV2(b.content, account.key, account.kid),
                )
              : b.content,
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
      label: labelPlain
        ? await sealField(key, sealMemoId.bodyLabel(b.id), b.label, () => encryptField(b.label, key))
        : b.label,
      content: contentPlain
        ? await sealField(key, sealMemoId.bodyContent(b.id), b.content, () =>
            encryptField(b.content, key),
          )
        : b.content,
    })
  }

  return { notes: outNotes, bodies: outBodies, dropped }
}
