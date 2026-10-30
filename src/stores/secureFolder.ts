import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'
import { FOLDERS_CACHE_KEY } from '@/constants/storage'
import { secureRekeyService, type RekeyResult } from '@/services/secureRekey.service'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useLangStore } from '@/stores/uiLang'
import type { Folder } from '@/types'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import { secureFolderPasswordIssue } from '@/utils/passwordStrength'
import {
  DEFAULT_PBKDF2_ITERATIONS,
  SECURE_VERIFIER_PLAINTEXT,
  decryptField,
  deriveKeyFromPassword,
  encryptField,
  generateSalt16,
  isEncryptedEnvelope,
  saltFromBase64,
  saltToBase64,
} from '@/utils/secureCrypto'

/**
 * CryptoKey chỉ trong RAM (Pinia); không ghi storage.
 * Đóng popup extension → mất key → phải nhập passphrase lại.
 */
export const useSecureFolderStore = defineStore('secureFolder', () => {
  const sessionKeys = shallowRef<Map<string, CryptoKey>>(new Map())
  /**
   * S9: salt đã dùng để dẫn từng khóa. Khác `secure_salt` hiện tại của thư mục = mật khẩu đã đổi ở máy khác → khóa cũ
   * mã hóa ra thứ mật khẩu mới không mở được. Luôn đổi cùng `sessionKeys` (reactivity đi theo `sessionKeys`).
   */
  const keySalts = new Map<string, string>()
  /** S9: thư mục bị quên khóa vì đổi mật khẩu ở máy khác — hộp mở khóa báo lý do. */
  const saltChangedIds = shallowRef<Set<string>>(new Set())
  /**
   * S9: thư mục đang đổi khóa NGAY TẠI ngữ cảnh này — chính lần ghi của mình phát onChanged trước setKey, và
   * folders.loadAll nạp folders_cache (salt cũ) trước → không được coi là "đổi ở máy khác".
   */
  const rekeying = new Set<string>()

  function keyMatchesFolder(folderId: string): boolean {
    const f = useFoldersStore().folders.find((x) => x.id === folderId)
    return !!f?.is_secure && !!f.secure_salt && f.secure_salt === keySalts.get(folderId)
  }

  /** Lệch salt → null NGAY: mọi đường ghi (notes / sync / secureCache) đã từ chối khi không có khóa. */
  function getKey(folderId: string): CryptoKey | null {
    const key = sessionKeys.value.get(folderId)
    if (!key) return null
    return keyMatchesFolder(folderId) ? key : null
  }

  function setKey(folderId: string, key: CryptoKey, saltB64: string): void {
    keySalts.set(folderId, saltB64)
    const next = new Map(sessionKeys.value)
    next.set(folderId, key)
    sessionKeys.value = next
    if (saltChangedIds.value.has(folderId)) {
      const ids = new Set(saltChangedIds.value)
      ids.delete(folderId)
      saltChangedIds.value = ids
    }
  }

  function deleteKey(folderId: string): void {
    keySalts.delete(folderId)
    if (!sessionKeys.value.has(folderId)) return
    const next = new Map(sessionKeys.value)
    next.delete(folderId)
    sessionKeys.value = next
  }

  function isFolderLocked(folderId: string): boolean {
    const folders = useFoldersStore()
    const f = folders.folders.find((x) => x.id === folderId)
    if (!f?.is_secure) return false
    return getKey(folderId) === null
  }

  /**
   * S9: thư mục đồng bộ về mang salt mới (đổi mật khẩu ở máy khác) → quên khóa cũ, nạp lại ghi chú như khóa tay (bản rõ
   * rời RAM). Đổi trên chính máy này: setKey(…, salt mới) chạy TRƯỚC khi thư mục mới vào store → ở đây thấy khớp.
   */
  watch(
    () => useFoldersStore().folders.map((f) => `${f.id}:${f.is_secure ? (f.secure_salt ?? '') : '-'}`).join('|'),
    () => {
      for (const folderId of [...sessionKeys.value.keys()]) {
        if (rekeying.has(folderId) || keyMatchesFolder(folderId)) continue
        const f = useFoldersStore().folders.find((x) => x.id === folderId)
        deleteKey(folderId)
        if (!f?.is_secure) continue
        const ids = new Set(saltChangedIds.value)
        ids.add(folderId)
        saltChangedIds.value = ids
        void useNotesStore().loadAll()
      }
    },
  )

  /**
   * S9: tab khác / popup / SW (đồng bộ về) ghi danh sách thư mục — ngữ cảnh này không tự nạp lại. Salt mới khác khóa đang
   * giữ → nạp lại thư mục, watcher ở trên quên khóa cũ. Khớp (ghi của chính mình) → không làm gì. Không có chrome → bỏ qua.
   */
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || keySalts.size === 0) return
      for (const k of [FOLDERS_CACHE_KEY, LOCAL_STORAGE_KEYS.folders]) {
        const rows = changes[k]?.newValue
        if (!Array.isArray(rows)) continue
        const stale = (rows as Folder[]).some(
          (f) => keySalts.has(f.id) && !rekeying.has(f.id) && f.is_secure && f.secure_salt !== keySalts.get(f.id),
        )
        if (stale) {
          void useFoldersStore().loadAll()
          return
        }
      }
    })
  }

  function strengthError(newPassword: string): Error | null {
    const issue = secureFolderPasswordIssue(newPassword)
    if (!issue) return null
    const { t } = useLangStore()
    return new Error(t(issue === 'tooShort' ? 'secureFolder.err.tooShort' : 'secureFolder.err.common'))
  }

  async function verifyPassphrase(
    folderId: string,
    password: string,
  ): Promise<void> {
    const folders = useFoldersStore()
    const folder = folders.folders.find((x) => x.id === folderId)
    if (!folder?.is_secure || !folder.secure_salt) {
      throw new Error('Folder is not secure')
    }
    const saltB64 = folder.secure_salt
    const salt = saltFromBase64(saltB64)
    if (salt.length !== 16) throw new Error('Invalid salt')
    const key = await deriveKeyFromPassword(
      password,
      salt,
      folder.pbkdf2_iterations,
    )
    const notes = useNotesStore()
    const list = notes.notes.filter((n) => n.folder_id === folderId)
    try {
      if (folder.secure_verifier_enc) {
        const plain = await decryptField(folder.secure_verifier_enc, key)
        if (plain !== SECURE_VERIFIER_PLAINTEXT) {
          throw new Error('Wrong passphrase')
        }
      } else if (list.length === 0) {
        setKey(folderId, key, saltB64)
        return
      } else {
        await decryptField(list[0].title, key)
        const firstBodies = notes.bodiesForNote(list[0].id)
        const firstBody = firstBodies[0]
        if (firstBody) {
          await decryptField(firstBody.label, key)
          await decryptField(firstBody.content, key)
        }
      }
    } catch {
      throw new Error('Wrong passphrase')
    }
    setKey(folderId, key, saltB64)
  }

  /**
   * S1: decrypt in-place mọi row envelope thuộc folder ĐANG unlock.
   * KHÔNG ghi cache — `persistCache()` gọi hàm này sau merge, gọi ngược lại sẽ thành đệ quy.
   */
  async function decryptLoadedSecureRows(): Promise<void> {
    if (sessionKeys.value.size === 0) return
    const notes = useNotesStore()
    for (const [folderId, key] of sessionKeys.value) {
      // S9: khóa dẫn từ salt cũ không giải mã được bản của mật khẩu mới — bỏ qua (watcher sẽ quên khóa).
      if (!keyMatchesFolder(folderId)) continue
      for (let i = 0; i < notes.notes.length; i++) {
        const n = notes.notes[i]
        if (n.folder_id !== folderId) continue
        if (!isEncryptedEnvelope(n.title)) {
          continue
        }
        const title = await decryptField(n.title, key)
        notes.notes[i] = { ...n, title }
      }
      for (let j = 0; j < notes.bodies.length; j++) {
        const b = notes.bodies[j]
        const note = notes.notes.find((x) => x.id === b.note_id)
        if (note?.folder_id !== folderId) continue
        if (
          !isEncryptedEnvelope(b.label) ||
          !isEncryptedEnvelope(b.content)
        ) {
          continue
        }
        const label = await decryptField(b.label, key)
        const content = await decryptField(b.content, key)
        notes.bodies[j] = { ...b, label, content }
      }
    }
  }

  async function unlockFolder(folderId: string, password: string): Promise<void> {
    await verifyPassphrase(folderId, password)
    const notes = useNotesStore()
    await notes.loadAll()
  }

  async function lockFolder(folderId: string): Promise<void> {
    deleteKey(folderId)
    const notes = useNotesStore()
    await notes.loadAll()
  }

  function lockAll(): void {
    keySalts.clear()
    sessionKeys.value = new Map()
  }

  async function enableSecureFolder(
    folderId: string,
    password: string,
    confirmPassword: string,
  ): Promise<void> {
    const weak = strengthError(password)
    if (weak) throw weak
    if (password !== confirmPassword) {
      throw new Error('Passphrases do not match')
    }
    const folders = useFoldersStore()
    const folder = folders.folders.find((x) => x.id === folderId)
    if (!folder) throw new Error('Folder not found')
    if (folder.is_secure) throw new Error('Folder is already secure')

    const salt = generateSalt16()
    const saltB64 = saltToBase64(salt)
    const key = await deriveKeyFromPassword(password, salt, DEFAULT_PBKDF2_ITERATIONS)

    const notes = useNotesStore()
    const list = notes.notes.filter((n) => n.folder_id === folderId)
    for (const n of list) {
      const bs = notes.bodiesForNote(n.id)
      if (isEncryptedEnvelope(n.title) || bs.some((b) => isEncryptedEnvelope(b.label) || isEncryptedEnvelope(b.content))) {
        throw new Error('Note already encrypted')
      }
    }
    rekeying.add(folderId)
    try {
      await commitFolderKey(folder, key, saltB64, async (v) => v)
    } finally {
      rekeying.delete(folderId)
    }
  }

  /**
   * SEC-13: mã hóa sẵn MỌI ghi chú + section của thư mục bằng khóa mới (chưa ghi gì) rồi MỘT lần
   * secureRekeyService.apply (RPC giao dịch / một lô ghi local). Lỗi → ném, KHÔNG đổi RAM / khóa / thư mục — thử lại an
   * toàn. `plainOf`: bản rõ của một trường (đang khóa → giải bằng khóa cũ; đang mở / thư mục thường → giữ nguyên).
   */
  async function commitFolderKey(
    folder: Folder,
    newKey: CryptoKey,
    newSaltB64: string,
    plainOf: (v: string) => Promise<string>,
  ): Promise<void> {
    const folders = useFoldersStore()
    const notes = useNotesStore()
    const list = notes.notes.filter((n) => n.folder_id === folder.id)
    const noteRows: { id: string; title: string }[] = []
    const bodyRows: { id: string; label: string; content: string }[] = []
    const plain = new Map<string, string>()
    for (const n of list) {
      const title = await plainOf(n.title)
      plain.set(`n:${n.id}`, title)
      noteRows.push({ id: n.id, title: await encryptField(title, newKey) })
      for (const b of notes.bodiesForNote(n.id)) {
        const label = await plainOf(b.label)
        const content = await plainOf(b.content)
        plain.set(`l:${b.id}`, label)
        plain.set(`c:${b.id}`, content)
        bodyRows.push({ id: b.id, label: await encryptField(label, newKey), content: await encryptField(content, newKey) })
      }
    }
    const verifier = await encryptField(SECURE_VERIFIER_PLAINTEXT, newKey)

    let res: RekeyResult
    try {
      res = await secureRekeyService.apply({
        folderId: folder.id,
        expectedSalt: folder.secure_salt,
        secure: { salt: newSaltB64, iterations: DEFAULT_PBKDF2_ITERATIONS, verifier },
        notes: noteRows,
        bodies: bodyRows,
      })
    } catch (e) {
      const { t } = useLangStore()
      if (/BBQ_REKEY_(STALE|INCOMPLETE)/.test(e instanceof Error ? e.message : '')) {
        // Máy khác vừa đổi khóa / thêm ghi chú → nạp lại để lần sau đủ dữ liệu.
        void folders.loadAll()
        void notes.loadAll()
        throw new Error(t('secureFolder.err.rekeyStale'))
      }
      throw new Error(t('secureFolder.err.rekeyFailed'))
    }

    // Đã ghi xong — giờ mới đổi khóa + RAM. S9: setKey TRƯỚC khi thư mục mới vào store (chốt salt không báo nhầm).
    setKey(folder.id, newKey, newSaltB64)
    const fIdx = folders.folders.findIndex((f) => f.id === folder.id)
    if (fIdx !== -1) folders.folders[fIdx] = res.folder
    const meta = new Map([...res.notes, ...res.bodies].map((m) => [m.id, { updated_at: m.updated_at, synced_at: m.synced_at }]))
    const newTitle = new Map(noteRows.map((r) => [r.id, r.title]))
    const newBody = new Map(bodyRows.map((r) => [r.id, r]))
    // RAM giữ đúng dạng cũ: đang là bản rõ → bản rõ; đang là bản mã (thư mục khóa) → bản mã mới.
    for (let i = 0; i < notes.notes.length; i++) {
      const n = notes.notes[i]
      if (n.folder_id !== folder.id || !newTitle.has(n.id)) continue
      notes.notes[i] = {
        ...n,
        ...meta.get(n.id),
        title: isEncryptedEnvelope(n.title) ? newTitle.get(n.id)! : plain.get(`n:${n.id}`)!,
      }
    }
    for (let j = 0; j < notes.bodies.length; j++) {
      const b = notes.bodies[j]
      const nb = newBody.get(b.id)
      if (!nb) continue
      notes.bodies[j] = {
        ...b,
        ...meta.get(b.id),
        label: isEncryptedEnvelope(b.label) ? nb.label : plain.get(`l:${b.id}`)!,
        content: isEncryptedEnvelope(b.content) ? nb.content : plain.get(`c:${b.id}`)!,
      }
    }
    folders.reorderFoldersByUpdated()
    await folders.persistCache()
    // Cache trên đĩa niêm phong lại bằng khóa mới (seal memo theo CryptoKey → không dùng lại bản mã của khóa cũ).
    await notes.persistCache()
    await notes.loadAll()
  }

  /** S9: hai khóa AES-GCM có trùng không — mã hóa thử bằng a, giải bằng b (khóa không trích ra được). */
  async function sameKey(a: CryptoKey, b: CryptoKey): Promise<boolean> {
    try {
      return (await decryptField(await encryptField(SECURE_VERIFIER_PLAINTEXT, a), b)) === SECURE_VERIFIER_PLAINTEXT
    } catch {
      return false
    }
  }

  /**
   * Mật khẩu cũ đúng? Có verifier → giải verifier. Không verifier mà đang mở (RAM là bản rõ, S1) → so với khóa phiên.
   * Đang khóa → giải ghi chú đầu (RAM là bản mã). Thư mục rỗng chưa có verifier → không có gì để so (như trước).
   */
  async function oldPasswordMatches(
    folderId: string,
    verifierEnc: string | null,
    oldKey: CryptoKey,
    firstNoteId: string | null,
  ): Promise<boolean> {
    try {
      if (verifierEnc) return (await decryptField(verifierEnc, oldKey)) === SECURE_VERIFIER_PLAINTEXT
      const session = getKey(folderId)
      if (session) return await sameKey(oldKey, session)
      if (!firstNoteId) return true
      const notes = useNotesStore()
      await decryptField(notes.notes.find((n) => n.id === firstNoteId)!.title, oldKey)
      const fb = notes.bodiesForNote(firstNoteId)[0]
      if (fb) {
        await decryptField(fb.label, oldKey)
        await decryptField(fb.content, oldKey)
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * Kiểm mật khẩu cũ → mã hóa lại mọi ghi chú bằng khóa mới (salt mới, DEFAULT vòng) → ghi thư mục.
   * Dùng chung cho đổi mật khẩu và S9 nâng cấp số vòng (giữ mật khẩu: oldPassword === newPassword).
   * S9: chạy được cả khi thư mục ĐANG MỞ — RAM khi đó là bản rõ (trước đây giải mã bản rõ → luôn "sai mật khẩu").
   */
  async function rekeyFolder(
    folderId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    rekeying.add(folderId)
    try {
      const folders = useFoldersStore()
      const folder = folders.folders.find((x) => x.id === folderId)
      if (!folder?.is_secure || !folder.secure_salt) {
        throw new Error('Folder is not secure')
      }

      const oldSalt = saltFromBase64(folder.secure_salt)
      if (oldSalt.length !== 16) throw new Error('Invalid salt')
      const oldKey = await deriveKeyFromPassword(
        oldPassword,
        oldSalt,
        folder.pbkdf2_iterations,
      )

      const notes = useNotesStore()
      const list = notes.notes.filter((n) => n.folder_id === folderId)
      if (!(await oldPasswordMatches(folderId, folder.secure_verifier_enc, oldKey, list[0]?.id ?? null))) {
        throw new Error('Current passphrase is wrong')
      }

      const newSalt = generateSalt16()
      const newSaltB64 = saltToBase64(newSalt)
      const newKey = await deriveKeyFromPassword(
        newPassword,
        newSalt,
        DEFAULT_PBKDF2_ITERATIONS,
      )
      /** Bản rõ của một trường: RAM là bản mã (đang khóa) → giải bằng khóa cũ; đang mở → RAM đã là bản rõ. */
      const plainOf = async (v: string): Promise<string> => (isEncryptedEnvelope(v) ? decryptField(v, oldKey) : v)

      await commitFolderKey(folder, newKey, newSaltB64, plainOf)
    } finally {
      rekeying.delete(folderId)
    }
  }

  async function changePassphrase(
    folderId: string,
    oldPassword: string,
    newPassword: string,
    confirmNew: string,
  ): Promise<void> {
    const weak = strengthError(newPassword)
    if (weak) throw weak
    if (newPassword !== confirmNew) {
      throw new Error('New passphrases do not match')
    }
    await rekeyFolder(folderId, oldPassword, newPassword)
  }

  /**
   * S9: nâng thư mục cũ (< DEFAULT vòng) lên DEFAULT — giữ nguyên mật khẩu (không áp độ mạnh mới). Chỉ khi người dùng
   * bấm: máy chưa có chốt salt (bản < 2.2.0) vẫn ghi bằng khóa cũ nếu đang mở thư mục lúc nâng cấp.
   */
  async function upgradeIterations(folderId: string, password: string): Promise<void> {
    await rekeyFolder(folderId, password, password)
  }

  /** Sau khi xóa folder trên server: bỏ key khỏi phiên. */
  function forgetFolderKey(folderId: string): void {
    deleteKey(folderId)
  }

  return {
    sessionKeys,
    saltChangedIds,
    getKey,
    forgetFolderKey,
    isFolderLocked,
    unlockFolder,
    lockFolder,
    lockAll,
    enableSecureFolder,
    changePassphrase,
    upgradeIterations,
    decryptLoadedSecureRows,
  }
})
