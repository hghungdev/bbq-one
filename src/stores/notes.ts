import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { NOTE_BODIES_CACHE_KEY, NOTES_CACHE_KEY } from '@/constants/storage'
import { noteBodiesService } from '@/services/noteBodies.service'
import { notesService } from '@/services/notes.service'
import {
  localNoteBodiesService,
  localNotesService,
} from '@/services/localFirst/localNotes.service'
import { useFoldersStore } from '@/stores/folders'
import { useSecureFolderStore } from '@/stores/secureFolder'
import { useAccountCryptoStore } from '@/stores/accountCrypto'
import { useAuthStore } from '@/stores/auth'
import type { Note, NoteBody } from '@/types'
import { decryptField, encryptField, encryptFieldV2, isEncryptedEnvelope } from '@/utils/secureCrypto'
import { withTimeout } from '@/utils/withTimeout'
import { isNetworkError } from '@/utils/networkErrors'
import { isSyncConflictError, nextLocalUpdatedAt } from '@/utils/syncConflict'
import { scheduleAutoSync } from '@/services/autoSync.service'
import { isOnline } from '@/services/networkReachability.service'
import { isRowDirty, mergeFreshWithDirtyLocal, mergeSnapshotWithStored } from '@/services/sync.service'
import { useUndoToastStore } from '@/stores/undoToast'
import { useLangStore } from '@/stores/uiLang'
import { safeCacheWrite } from '@/utils/cacheWrite'
import { sealSecureRowsForCache } from '@/utils/secureCache'
import { indexBodiesByNote } from '@/utils/noteBodyIndex'
import { filterNotesByText } from '@/utils/noteSearch'

const NETWORK_LOAD_MS = 12_000

/**
 * S2C1.6: đã đăng nhập mà CHƯA biết account có mã hóa không → ghi được nhưng GIỮ LẠI ở máy (không
 * gọi server; tạo mới → local-first). Đường push fail-closed khi chưa biết (S2C1.4) nên không gì
 * lên server dạng rõ; biết rồi mới đẩy (có key → v2). S2C1.5 chặn hẳn → user KHÔNG bật mã hóa mất
 * quyền sửa mỗi khi lần kiểm tra trạng thái lỗi.
 */
const HOLD_LOCAL = new Error('Encryption status unknown — change kept on this device')
function holdWritesLocal(): boolean {
  return !useAccountCryptoStore().fetched && useAuthStore().isAuthenticated
}

/** S2C1.6: key lúc bắt đầu mutation còn là key hiện tại? lockNow chạy xong giữa chừng → không. */
function keyStillHeld(key: CryptoKey): boolean {
  return useAccountCryptoStore().getContentKey() === key
}

/** S2C1: row NGOÀI secure folder + account bật → phải có K_content mới được mutate. */
function requireAccountKey(): { key: CryptoKey; kid: string } | null {
  const account = useAccountCryptoStore()
  if (!account.isEnabled()) return null
  const key = account.getContentKey()
  if (!key) throw new Error('Account locked')
  // S2C1.3: ghi = có thao tác → gia hạn tự khóa 30'.
  account.markActivity()
  return { key, kid: account.getDekId() }
}

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const bodies = ref<NoteBody[]>([])
  const activeNoteId = ref<string | null>(null)
  /** Body đang mở trong editor (phải thuộc activeNoteId). */
  const activeBodyId = ref<string | null>(null)
  const isDirty = ref(false)
  const loadError = ref<string | null>(null)
  const filterTag = ref<string | null>(null)
  const searchQuery = ref('')
  const searchResults = ref<Note[]>([])
  const searchLoading = ref(false)
  /** U5: Ctrl+F ở tab Notes → InlineSearch đầu cột mở + focus (tăng để kích watch). */
  const searchFocusRequest = ref(0)

  const activeNote = computed(
    () => notes.value.find((n) => n.id === activeNoteId.value) ?? null,
  )

  const activeBody = computed(
    () =>
      bodies.value.find((b) => b.id === activeBodyId.value) ?? null,
  )

  /**
   * P3: body theo ghi chú, sắp theo position — tính một lượt cho cả kho; nhóm không đổi giữ nguyên mảng (danh sách
   * không tính lại dòng của ghi chú khác). Mảng trong chỉ mục là CHỈ ĐỌC.
   */
  const bodiesByNote = computed((prev?: Map<string, readonly NoteBody[]>) => indexBodiesByNote(bodies.value, prev))

  function bodiesForNote(noteId: string): NoteBody[] {
    return (bodiesByNote.value.get(noteId) ?? []).slice()
  }

  function notesForFolder(folderId: string | null): Note[] {
    return notes.value
      .filter((n) => n.folder_id === folderId)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
  }

  /** P4: lần tìm mới nhất — kết quả server về muộn của lần cũ bị bỏ. */
  let searchSeq = 0

  async function runSearch(query: string): Promise<void> {
    const q = query.trim()
    const seq = ++searchSeq
    searchQuery.value = q
    if (!q) {
      searchResults.value = []
      searchLoading.value = false
      return
    }
    const setSearchResults = (list: Note[]): void => {
      searchResults.value = list
        .filter((n) => !isEncryptedEnvelope(n.title))
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
    }
    // P4: RAM có đủ ghi chú (cache + kho máy) → tìm ngay trên chữ, không đọc lại kho từ đĩa.
    const fromStore = filterNotesByText(notes.value, bodiesByNote.value, q)
    setSearchResults(fromStore)
    if (!useAuthStore().isAuthenticated) {
      searchLoading.value = false
      return
    }
    // Đăng nhập: gộp thêm full-text server (gốc từ tiếng Anh). Lỗi → giữ kết quả RAM.
    searchLoading.value = true
    try {
      const fromApi = await notesService.searchFullText(q)
      if (seq !== searchSeq) return
      const byId = new Map<string, Note>()
      for (const n of fromApi) byId.set(n.id, n)
      for (const n of fromStore) byId.set(n.id, n)
      setSearchResults([...byId.values()])
    } catch (e) {
      console.warn('[notes] server search failed — showing local results', e)
    } finally {
      if (seq === searchSeq) searchLoading.value = false
    }
  }

  function clearSearch(): void {
    searchQuery.value = ''
    searchResults.value = []
  }

  function requestSearchFocus(): void {
    searchFocusRequest.value++
  }

  function setFilterTag(tag: string | null): void {
    if (tag && filterTag.value === tag) {
      filterTag.value = null
      return
    }
    filterTag.value = tag
  }

  /**
   * S2C1.5: persistCache chạy TUẦN TỰ. lockNow (seal → bỏ key → nạp lại RAM từ đĩa) đi qua cùng
   * hàng đợi (sealThenReloadExclusive) — không lượt persist nào chen giữa để ghi RAM plaintext
   * xuống đĩa lúc key vừa bị bỏ.
   */
  let persistQueue: Promise<unknown> = Promise.resolve()
  function runPersistExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = persistQueue.then(fn, fn)
    persistQueue = run.catch(() => {})
    return run
  }

  /** `alreadyExclusive`: CHỈ sealThenReloadExclusive (đang giữ hàng đợi) — tránh tự chờ chính mình. */
  async function persistCache(alreadyExclusive = false): Promise<void> {
    if (alreadyExclusive !== true) {
      return runPersistExclusive(() => persistCache(true))
    }
    // N5: đọc-merge-ghi — không đè mất edit mà context khác (popup/tab/SW) vừa persist.
    const stored = await chrome.storage.local.get([NOTES_CACHE_KEY, NOTE_BODIES_CACHE_KEY])
    const diskNotes = Array.isArray(stored[NOTES_CACHE_KEY])
      ? (stored[NOTES_CACHE_KEY] as Note[])
      : []
    const diskBodies = Array.isArray(stored[NOTE_BODIES_CACHE_KEY])
      ? (stored[NOTE_BODIES_CACHE_KEY] as NoteBody[])
      : []
    notes.value = mergeSnapshotWithStored(notes.value, diskNotes, isRowDirty)
    bodies.value = mergeSnapshotWithStored(bodies.value, diskBodies, isRowDirty)

    // S1: merge có thể kéo row CIPHERTEXT từ đĩa vào RAM (context khác vừa ghi bản niêm phong)
    // → decrypt lại cho folder đang unlock, nếu không UI hiện chuỗi `retronote:1:…`.
    const secure = useSecureFolderStore()
    await secure.decryptLoadedSecureRows()
    const account = useAccountCryptoStore()
    // S2C1.5: chụp key MỘT lần cho cả overlay lẫn seal — key bị bỏ giữa chừng (logout) thì vẫn
    // seal bằng chính key đã dùng để giải mã, không để row vừa giải mã đi xuống đĩa dạng rõ.
    const accountKey = account.getContentKey()
    await account.decryptLoadedAccountRows()

    // S1: RAM giữ plaintext để hiển thị; ĐĨA chỉ được nhận envelope.
    const folders = useFoldersStore()
    const sealed = await sealSecureRowsForCache({
      notes: notes.value,
      bodies: bodies.value,
      isSecureFolder: folders.isSecureFolder,
      getKey: secure.getKey,
      account: accountKey ? { key: accountKey, kid: account.getDekId() } : null,
    })

    await safeCacheWrite(
      {
        [NOTES_CACHE_KEY]: sealed.notes,
        [NOTE_BODIES_CACHE_KEY]: sealed.bodies,
      },
      (e) => {
        loadError.value = e instanceof Error ? e.message : 'Cache write failed'
      },
    )
  }

  /**
   * S2C1.5 — lockNow: trong MỘT lượt độc quyền với persistCache: seal đĩa bằng key còn sống →
   * `dropKey()` → nạp lại RAM từ đĩa (chỉ còn envelope). `finally`: persist lỗi cũng không được
   * chặn việc khóa.
   */
  async function sealThenReloadExclusive(dropKey: () => void | Promise<void>): Promise<void> {
    await runPersistExclusive(async () => {
      try {
        await persistCache(true)
      } finally {
        await dropKey()
        await hydrateFromCache()
      }
    })
  }

  async function hydrateFromCache(): Promise<void> {
    const cached = await chrome.storage.local.get([
      NOTES_CACHE_KEY,
      NOTE_BODIES_CACHE_KEY,
    ])
    const rawNotes = cached[NOTES_CACHE_KEY] as Note[] | undefined
    const rawBodies = cached[NOTE_BODIES_CACHE_KEY] as NoteBody[] | undefined
    if (Array.isArray(rawNotes) && rawNotes.length > 0) {
      notes.value = rawNotes
    }
    if (Array.isArray(rawBodies) && rawBodies.length > 0) {
      bodies.value = rawBodies
    }
  }

  async function loadAll(): Promise<void> {
    loadError.value = null
    try {
      await hydrateFromCache()
      // S1: đĩa chỉ còn envelope — decrypt-overlay ngay cho folder đang unlock.
      // No-op khi chưa unlock (sessionKeys rỗng). PHẢI đứng TRƯỚC early-return offline.
      await useSecureFolderStore().decryptLoadedSecureRows()
      await useAccountCryptoStore().decryptLoadedAccountRows()
      if (!isOnline()) return
      const [freshNotes, freshBodies] = await withTimeout(
        Promise.all([notesService.getAll(), noteBodiesService.getAll()]),
        NETWORK_LOAD_MS,
        'Load notes timed out',
      )
      // Không đè row đang dirty (sửa offline chưa push) bằng bản server cũ.
      notes.value = mergeFreshWithDirtyLocal(freshNotes, notes.value, isRowDirty)
      bodies.value = mergeFreshWithDirtyLocal(freshBodies, bodies.value, isRowDirty)
      await persistCache()
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : 'Load notes failed'
      const cached = await chrome.storage.local.get([
        NOTES_CACHE_KEY,
        NOTE_BODIES_CACHE_KEY,
      ])
      const rawNotes = cached[NOTES_CACHE_KEY] as Note[] | undefined
      const rawBodies = cached[NOTE_BODIES_CACHE_KEY] as NoteBody[] | undefined
      if (Array.isArray(rawNotes) && rawNotes.length > 0) {
        notes.value = rawNotes
      }
      if (Array.isArray(rawBodies) && rawBodies.length > 0) {
        bodies.value = rawBodies
      }
      // S1: cache-reload trong catch cũng nạp envelope từ đĩa → overlay lại.
      await useSecureFolderStore().decryptLoadedSecureRows()
      await useAccountCryptoStore().decryptLoadedAccountRows()
    }
  }

  async function createNote(folderId: string | null, initialTitle = ''): Promise<Note> {
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null
    const key =
      folderId && folder?.is_secure ? secure.getKey(folderId) : null
    if (folder?.is_secure && !key) {
      throw new Error('Folder locked')
    }
    let title = initialTitle.trim()
    let bodyLabel = ''
    let bodyContent = ''
    if (folder?.is_secure && key) {
      title = await encryptField('', key)
      bodyLabel = await encryptField('', key)
      bodyContent = await encryptField('', key)
    }
    const acct = folder?.is_secure ? null : requireAccountKey()
    if (acct) {
      title = await encryptFieldV2(title, acct.key, acct.kid)
      bodyLabel = await encryptFieldV2('', acct.key, acct.kid)
      bodyContent = await encryptFieldV2('', acct.key, acct.kid)
    }
    const holdLocal = !folder?.is_secure && holdWritesLocal()
    let note: Note
    let bodyRow: NoteBody
    let createdOffline = false
    try {
      if (holdLocal) throw HOLD_LOCAL
      note = await notesService.create({
        title,
        folder_id: folderId,
        tags: [],
      })
      bodyRow = await noteBodiesService.create(note.id, {
        label: bodyLabel,
        content: bodyContent,
        position: 0,
      })
    } catch (e) {
      // Offline / network fail: ghi vào LocalFirst storage để autoSync push sau.
      // KHÔNG mất dữ liệu user vừa tạo.
      if (e !== HOLD_LOCAL && isOnline() && !isNetworkError(e)) throw e
      const localNote = await localNotesService.create({
        title,
        folder_id: folderId,
        tags: [],
      })
      const localBody = await localNoteBodiesService.create(localNote.id, {
        label: bodyLabel,
        content: bodyContent,
        position: 0,
      })
      note = { ...localNote, user_id: '' } as Note
      bodyRow = { ...localBody, user_id: '' } as NoteBody
      createdOffline = true
    }
    let storedNote = note
    let storedBody = bodyRow
    if (folder?.is_secure && key) {
      storedNote = {
        ...note,
        title: await decryptField(note.title, key),
      }
      storedBody = {
        ...bodyRow,
        label: await decryptField(bodyRow.label, key),
        content: await decryptField(bodyRow.content, key),
      }
    } else if (acct && keyStillHeld(acct.key)) {
      // S2C1.6: chỉ khi còn đúng key — lockNow chạy xong lúc chờ mạng thì giữ bản mã hóa.
      storedNote = { ...note, title: initialTitle.trim() }
      storedBody = { ...bodyRow, label: '', content: '' }
    }
    notes.value = [storedNote, ...notes.value]
    bodies.value = [storedBody, ...bodies.value]
    if (!acct || keyStillHeld(acct.key)) {
      activeNoteId.value = storedNote.id
      activeBodyId.value = storedBody.id
    }
    isDirty.value = createdOffline
    await persistCache()
    if (createdOffline) scheduleAutoSync('note-create-offline')
    return storedNote
  }

  async function updateNote(
    id: string,
    updates: Partial<Pick<Note, 'title' | 'folder_id' | 'tags'>>,
  ): Promise<void> {
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const idx = notes.value.findIndex((n) => n.id === id)
    const prev = idx === -1 ? null : notes.value[idx]
    if (!prev) return

    const folderId =
      updates.folder_id !== undefined ? updates.folder_id : prev.folder_id
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null

    let payload: Partial<Pick<Note, 'title' | 'folder_id' | 'tags'>> = {
      ...updates,
    }

    if (folder?.is_secure) {
      const k = secure.getKey(folderId!)
      if (!k) throw new Error('Folder locked')
      if (payload.title !== undefined) {
        payload.title = await encryptField(payload.title, k)
      }
    }

    let acctUpd: { key: CryptoKey; kid: string } | null = null
    if (!folder?.is_secure) {
      acctUpd = requireAccountKey()
      if (acctUpd && payload.title !== undefined) {
        payload.title = await encryptFieldV2(payload.title, acctUpd.key, acctUpd.kid)
      }
    }
    const holdLocal = !folder?.is_secure && holdWritesLocal()

    try {
      if (holdLocal) throw HOLD_LOCAL
      const data = await notesService.update(id, payload, {
        row: prev,
        retryOnConflictWithServerState: true,
      })
      const merged: Note = { ...prev, ...data }
      // RAM có thể đã được nạp lại trong lúc chờ (lockNow / loadAll) — tìm lại theo id.
      const at = notes.value.findIndex((n) => n.id === id)

      if (at === -1) {
        // row đã rời RAM (xóa / nạp lại) — server đã cập nhật, không gán gì thêm
      } else if (folder?.is_secure) {
        const k = secure.getKey(folderId!)
        if (k) {
          notes.value[at] = {
            ...merged,
            title: await decryptField(data.title, k),
          }
        } else {
          notes.value[at] = merged
        }
      } else if (acctUpd) {
        // S2C1.6: hết key giữa chừng → RAM chỉ được nhận envelope (payload / row hiện tại).
        notes.value[at] = keyStillHeld(acctUpd.key)
          ? { ...merged, title: updates.title ?? prev.title }
          : { ...merged, title: payload.title ?? notes.value[at].title }
      } else {
        notes.value[at] = merged
      }
      isDirty.value = false
      await persistCache()
    } catch (e) {
      if (e !== HOLD_LOCAL) {
        if (isSyncConflictError(e)) throw e
        if (isOnline() && !isNetworkError(e)) throw e
      }
      const ts = nextLocalUpdatedAt(prev)
      const at = notes.value.findIndex((n) => n.id === id)
      if (at === -1) return
      notes.value[at] =
        acctUpd && !keyStillHeld(acctUpd.key)
          ? { ...notes.value[at], ...payload, updated_at: ts }
          : { ...prev, ...updates, updated_at: ts }
      isDirty.value = true
      await persistCache()
      scheduleAutoSync('note-offline')
    }
  }

  /**
   * Chuyển note sang folder khác (v1: chỉ giữa folder thường).
   * Không hỗ trợ vào/ra secure — cần re-encrypt title+bodies (v2).
   */
  async function moveNoteToFolder(
    noteId: string,
    targetFolderId: string,
  ): Promise<void> {
    const folders = useFoldersStore()
    const note = notes.value.find((n) => n.id === noteId)
    if (!note) throw new Error('Note not found')
    if (note.folder_id === targetFolderId) return

    const source = note.folder_id
      ? folders.folders.find((f) => f.id === note.folder_id)
      : null
    const target = folders.folders.find((f) => f.id === targetFolderId)
    if (!target) throw new Error('Target folder not found')
    if (source?.is_secure || target.is_secure) {
      throw new Error('SECURE_FOLDER_MOVE_UNSUPPORTED')
    }

    await updateNote(noteId, { folder_id: targetFolderId })
    if (activeNoteId.value === noteId) {
      folders.alignActiveFolderToNoteFolder(targetFolderId)
    }
  }

  async function updateBody(
    id: string,
    updates: Partial<Pick<NoteBody, 'label' | 'content'>>,
  ): Promise<void> {
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const idx = bodies.value.findIndex((b) => b.id === id)
    const prev = idx === -1 ? null : bodies.value[idx]
    if (!prev) return

    const note = notes.value.find((n) => n.id === prev.note_id)
    const folderId = note?.folder_id ?? null
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null

    let payload: Partial<Pick<NoteBody, 'label' | 'content'>> = { ...updates }

    if (folder?.is_secure) {
      const k = secure.getKey(folderId!)
      if (!k) throw new Error('Folder locked')
      if (payload.label !== undefined) {
        payload.label = await encryptField(payload.label, k)
      }
      if (payload.content !== undefined) {
        payload.content = await encryptField(payload.content, k)
      }
    }

    let acctUpd: { key: CryptoKey; kid: string } | null = null
    if (!folder?.is_secure) {
      acctUpd = requireAccountKey()
      if (acctUpd) {
        if (payload.label !== undefined) {
          payload.label = await encryptFieldV2(payload.label, acctUpd.key, acctUpd.kid)
        }
        if (payload.content !== undefined) {
          payload.content = await encryptFieldV2(payload.content, acctUpd.key, acctUpd.kid)
        }
      }
    }

    const holdLocal = !folder?.is_secure && holdWritesLocal()

    try {
      if (holdLocal) throw HOLD_LOCAL
      const data = await noteBodiesService.update(id, payload, {
        row: prev,
        retryOnConflictWithServerState: true,
      })
      const merged: NoteBody = { ...prev, ...data }
      // RAM có thể đã được nạp lại trong lúc chờ (lockNow / loadAll) — tìm lại theo id.
      const at = bodies.value.findIndex((b) => b.id === id)

      if (at === -1) {
        // row đã rời RAM (xóa / nạp lại) — server đã cập nhật, không gán gì thêm
      } else if (folder?.is_secure) {
        const k = secure.getKey(folderId!)
        if (k) {
          bodies.value[at] = {
            ...merged,
            label: await decryptField(data.label, k),
            content: await decryptField(data.content, k),
          }
        } else {
          bodies.value[at] = merged
        }
      } else if (acctUpd) {
        const cur = bodies.value[at]
        // S2C1.6: hết key giữa chừng → RAM chỉ được nhận envelope (payload / row hiện tại).
        bodies.value[at] = keyStillHeld(acctUpd.key)
          ? {
              ...merged,
              label: updates.label ?? prev.label,
              content: updates.content ?? prev.content,
            }
          : {
              ...merged,
              label: payload.label ?? cur.label,
              content: payload.content ?? cur.content,
            }
      } else {
        bodies.value[at] = merged
      }
      isDirty.value = false
      await persistCache()
    } catch (e) {
      if (e !== HOLD_LOCAL) {
        if (isSyncConflictError(e)) throw e
        if (isOnline() && !isNetworkError(e)) throw e
      }
      const ts = nextLocalUpdatedAt(prev)
      const at = bodies.value.findIndex((b) => b.id === id)
      if (at === -1) return
      const cur = bodies.value[at]
      bodies.value[at] =
        acctUpd && !keyStillHeld(acctUpd.key)
          ? {
              ...cur,
              label: payload.label ?? cur.label,
              content: payload.content ?? cur.content,
              updated_at: ts,
            }
          : {
              ...prev,
              label: updates.label ?? prev.label,
              content: updates.content ?? prev.content,
              updated_at: ts,
            }
      const noteIdx = notes.value.findIndex((n) => n.id === prev.note_id)
      if (noteIdx !== -1) {
        notes.value[noteIdx] = { ...notes.value[noteIdx], updated_at: ts }
      }
      isDirty.value = true
      await persistCache()
      scheduleAutoSync('body-offline')
    }
  }

  async function createBodyForNote(noteId: string): Promise<NoteBody> {
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const note = notes.value.find((n) => n.id === noteId)
    if (!note) throw new Error('Note not found')
    const folderId = note.folder_id
    const folder = folderId ? folders.folders.find((f) => f.id === folderId) : null
    const key =
      folderId && folder?.is_secure ? secure.getKey(folderId) : null
    if (folder?.is_secure && !key) {
      throw new Error('Folder locked')
    }
    const list = bodiesForNote(noteId)
    const position = list.length === 0 ? 0 : Math.max(...list.map((b) => b.position)) + 1
    let label = ''
    let content = ''
    if (folder?.is_secure && key) {
      label = await encryptField('', key)
      content = await encryptField('', key)
    }
    const acct = folder?.is_secure ? null : requireAccountKey()
    if (acct) {
      label = await encryptFieldV2('', acct.key, acct.kid)
      content = await encryptFieldV2('', acct.key, acct.kid)
    }
    const holdLocal = !folder?.is_secure && holdWritesLocal()
    let row: NoteBody
    let createdOffline = false
    try {
      if (holdLocal) throw HOLD_LOCAL
      row = await noteBodiesService.create(noteId, {
        label,
        content,
        position,
      })
    } catch (e) {
      if (e !== HOLD_LOCAL && isOnline() && !isNetworkError(e)) throw e
      const localBody = await localNoteBodiesService.create(noteId, {
        label,
        content,
        position,
      })
      row = { ...localBody, user_id: '' } as NoteBody
      createdOffline = true
    }
    let stored = row
    if (folder?.is_secure && key) {
      stored = {
        ...row,
        label: await decryptField(row.label, key),
        content: await decryptField(row.content, key),
      }
    } else if (acct && keyStillHeld(acct.key)) {
      stored = { ...row, label: '', content: '' }
    }
    bodies.value = [...bodies.value, stored]
    if (!acct || keyStillHeld(acct.key)) activeBodyId.value = stored.id
    await persistCache()
    if (createdOffline) scheduleAutoSync('body-create-offline')
    return stored
  }

  async function deleteBody(id: string): Promise<void> {
    const prev = bodies.value.find((b) => b.id === id)
    if (!prev) return
    const sibs = bodiesForNote(prev.note_id)
    if (sibs.length <= 1) {
      await deleteNote(prev.note_id)
      return
    }
    await noteBodiesService.delete(id)
    bodies.value = bodies.value.filter((b) => b.id !== id)
    if (activeBodyId.value === id) {
      const rest = bodiesForNote(prev.note_id)
      activeBodyId.value = rest[0]?.id ?? null
    }
    await persistCache()
  }

  async function deleteNote(
    id: string,
    options: { undoable?: boolean } = {},
  ): Promise<void> {
    const undoable = options.undoable ?? true
    if (undoable) {
      await scheduleDeleteNote(id)
      return
    }
    await deleteNoteImmediately(id)
  }

  async function deleteNoteImmediately(id: string): Promise<void> {
    await notesService.delete(id)
    notes.value = notes.value.filter((n) => n.id !== id)
    bodies.value = bodies.value.filter((b) => b.note_id !== id)
    if (activeNoteId.value === id) activeNoteId.value = null
    if (activeBodyId.value && !bodies.value.some((b) => b.id === activeBodyId.value)) {
      activeBodyId.value = null
    }
    await persistCache()
  }

  async function scheduleDeleteNote(id: string): Promise<void> {
    const noteIndex = notes.value.findIndex((n) => n.id === id)
    const note = noteIndex === -1 ? null : {
      ...notes.value[noteIndex],
      tags: notes.value[noteIndex].tags.slice(),
    }
    if (!note) return
    const folders = useFoldersStore()
    const folder = note.folder_id
      ? folders.folders.find((f) => f.id === note.folder_id)
      : null
    const noteBodies = bodies.value
      .map((body, index) => ({ body: { ...body }, index }))
      .filter(({ body }) => body.note_id === id)
    const account = useAccountCryptoStore()
    account.markActivity()
    // S2C1.5: Undo / commit-thất-bại có thể chạy SAU khi đã khóa (Khóa ngay / tự khóa trong 5 s)
    // — giữ thêm bản đã seal; lúc khóa RAM (rồi đĩa) chỉ được nhận envelope.
    const accountKey = account.getContentKey()
    const sealedSnap = await sealSecureRowsForCache({
      notes: [note],
      bodies: noteBodies.map(({ body }) => body),
      isSecureFolder: folders.isSecureFolder,
      getKey: useSecureFolderStore().getKey,
      account: accountKey ? { key: accountKey, kid: account.getDekId() } : null,
    })
    // S2C1.6: so theo KEY (không theo isEnabled — logout / mất session làm isEnabled() false).
    const restoringWhileLocked = (): boolean =>
      accountKey !== null && account.getContentKey() !== accountKey
    const snapshotForRestore = (): { n: Note; bs: { body: NoteBody; index: number }[] } => {
      if (!restoringWhileLocked()) return { n: note, bs: noteBodies }
      const sealedBodies = new Map(sealedSnap.bodies.map((b) => [b.id, b]))
      return {
        n: sealedSnap.notes[0] ?? note,
        bs: noteBodies.map(({ body, index }) => ({ body: sealedBodies.get(body.id) ?? body, index })),
      }
    }
    const searchResultIndex = searchResults.value.findIndex((n) => n.id === id)
    const wasInSearchResults = searchResultIndex !== -1
    const prevSearchQuery = searchQuery.value
    const prevActiveNoteId = activeNoteId.value
    const prevActiveBodyId = activeBodyId.value

    notes.value = notes.value.filter((n) => n.id !== id)
    bodies.value = bodies.value.filter((b) => b.note_id !== id)
    searchResults.value = searchResults.value.filter((n) => n.id !== id)
    if (activeNoteId.value === id) activeNoteId.value = null
    if (activeBodyId.value && !bodies.value.some((b) => b.id === activeBodyId.value)) {
      activeBodyId.value = null
    }
    await persistCache()

    const undoToast = useUndoToastStore()
    const { t } = useLangStore()
    await undoToast.schedule({
      id: `note:${id}`,
      message: t('undo.noteDeleted', {
        title: note.title.trim() || t('notes.untitled'),
        folder: folder?.name ?? t('undo.noFolder'),
      }),
      undo: async () => {
        const { n, bs } = snapshotForRestore()
        restoreNoteSnapshot(n, noteIndex, bs)
        if (wasInSearchResults && searchQuery.value === prevSearchQuery) {
          restoreSearchResultSnapshot(n, searchResultIndex)
        }
        // Đã khóa thì không mở lại ghi chú trong editor (chỉ còn envelope).
        if (!restoringWhileLocked()) {
          if (activeNoteId.value === null && prevActiveNoteId === id) {
            activeNoteId.value = prevActiveNoteId
          }
          if (activeBodyId.value === null && prevActiveBodyId) {
            activeBodyId.value = prevActiveBodyId
          }
        }
        await persistCache()
      },
      commit: async () => {
        try {
          await notesService.delete(id)
        } catch (e) {
          if (isNetworkError(e)) {
            loadError.value = e instanceof Error ? e.message : 'Delete note failed'
            throw e
          }
          const { n, bs } = snapshotForRestore()
          restoreNoteSnapshot(n, noteIndex, bs)
          if (wasInSearchResults && searchQuery.value === prevSearchQuery) {
            restoreSearchResultSnapshot(n, searchResultIndex)
          }
          if (!restoringWhileLocked()) {
            if (activeNoteId.value === null && prevActiveNoteId === id) {
              activeNoteId.value = prevActiveNoteId
            }
            if (activeBodyId.value === null && prevActiveBodyId) {
              activeBodyId.value = prevActiveBodyId
            }
          }
          loadError.value = e instanceof Error ? e.message : 'Delete note failed'
          await persistCache()
          return
        }
        if (noteBodies.length > 0) {
          await persistCache()
        }
      },
    })
  }

  function restoreNoteSnapshot(
    note: Note,
    noteIndex: number,
    noteBodies: { body: NoteBody; index: number }[],
  ): void {
    if (!notes.value.some((n) => n.id === note.id)) {
      const nextNotes = notes.value.slice()
      nextNotes.splice(Math.min(Math.max(noteIndex, 0), nextNotes.length), 0, note)
      notes.value = nextNotes
    }

    let nextBodies = bodies.value.slice()
    for (const { body, index } of noteBodies) {
      if (nextBodies.some((b) => b.id === body.id)) continue
      nextBodies.splice(Math.min(Math.max(index, 0), nextBodies.length), 0, body)
    }
    bodies.value = nextBodies
  }

  function restoreSearchResultSnapshot(note: Note, index: number): void {
    if (searchResults.value.some((n) => n.id === note.id)) return
    const next = searchResults.value.slice()
    next.splice(Math.min(Math.max(index, 0), next.length), 0, note)
    searchResults.value = next
  }

  /**
   * Chọn note. `preferredBodyId`: khi chọn body cụ thể (cột BODY).
   */
  function selectNote(
    id: string | null,
    preferredBodyId?: string | null,
  ): void {
    if (id && searchQuery.value.trim()) clearSearch()
    activeNoteId.value = id
    if (!id) {
      activeBodyId.value = null
      return
    }
    const n = notes.value.find((x) => x.id === id)
    if (n?.folder_id) {
      useFoldersStore().alignActiveFolderToNoteFolder(n.folder_id)
    }
    const bs = bodiesForNote(id)
    if (bs.length === 0) {
      activeBodyId.value = null
      return
    }
    if (
      preferredBodyId &&
      bs.some((b) => b.id === preferredBodyId)
    ) {
      activeBodyId.value = preferredBodyId
      return
    }
    const stillValid =
      activeBodyId.value &&
      bs.some((b) => b.id === activeBodyId.value)
    if (!stillValid) {
      activeBodyId.value = bs[0]?.id ?? null
    }
  }

  function selectBody(bodyId: string | null): void {
    activeBodyId.value = bodyId
  }

  function setDirty(value: boolean): void {
    isDirty.value = value
  }

  return {
    notes,
    bodies,
    activeNoteId,
    activeBodyId,
    activeNote,
    activeBody,
    isDirty,
    loadError,
    filterTag,
    searchQuery,
    searchResults,
    searchLoading,
    searchFocusRequest,
    bodiesByNote,
    bodiesForNote,
    notesForFolder,
    runSearch,
    clearSearch,
    requestSearchFocus,
    setFilterTag,
    loadAll,
    hydrateFromCache,
    createNote,
    createBodyForNote,
    updateNote,
    moveNoteToFolder,
    updateBody,
    deleteNote,
    deleteBody,
    selectNote,
    selectBody,
    setDirty,
    persistCache,
    sealThenReloadExclusive,
  }
})
