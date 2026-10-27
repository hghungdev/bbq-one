<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import NoteEditor from '@/components/notes/NoteEditor.vue'
  import NoteList from '@/components/layout/NoteList.vue'
  import SearchBar from '@/components/layout/SearchBar.vue'
  import SettingsModal from '@/components/layout/SettingsModal.vue'
  import Sidebar from '@/components/layout/Sidebar.vue'
  import RetroButton from '@/components/ui/RetroButton.vue'
  import BookmarkTab from '@/components/bookmarks/BookmarkTab.vue'
  import CalendarTab from '@/components/calendar/CalendarTab.vue'
  import CalendarTodayBanner from '@/components/calendar/CalendarTodayBanner.vue'
  import CalendarOverdueReminderDialog from '@/components/calendar/CalendarOverdueReminderDialog.vue'
  import ConflictBackupsDialog from '@/components/sync/ConflictBackupsDialog.vue'
  import LoginModal from '@/components/auth/LoginModal.vue'
  import AccountUnlockModal from '@/components/account/AccountUnlockModal.vue'
  import { useColumnResize } from '@/composables/useColumnResize'
  import { useCommitPendingDeletesOnClose } from '@/composables/useCommitPendingDeletesOnClose'
  import { flushOrphanedPendingDeleteCommits, listUnexpiredPendingDeletes } from '@/services/pendingDeleteCommit.service'
  import { useAuthStore } from '@/stores/auth'
  import { useFoldersStore } from '@/stores/folders'
  import { useNotesStore } from '@/stores/notes'
  import { useSecureFolderStore } from '@/stores/secureFolder'
  import { useAccountCryptoStore } from '@/stores/accountCrypto'
  import { useSyncStore } from '@/stores/sync'
  import { useLangStore } from '@/stores/uiLang'
  import { useCalendarEventsStore } from '@/stores/calendarEvents'
  import CloudSyncStatusBadge from '@/components/sync/CloudSyncStatusBadge.vue'
  import type { CloudSyncVariant } from '@/components/sync/CloudSyncStatusBadge.vue'
  import SyncStatusBadge from '@/components/sync/SyncStatusBadge.vue'
  import IconButton from '@/components/ui/IconButton.vue'
  import ThemeModeToggle from '@/components/ui/ThemeModeToggle.vue'
  import UndoToast from '@/components/ui/UndoToast.vue'
  import { useUndoToastStore } from '@/stores/undoToast'
  import DashboardSkeleton from '@/components/ui/DashboardSkeleton.vue'
  import OfflineBanner from '@/components/ui/OfflineBanner.vue'
  import { todayLocalKey } from '@/utils/calendarDate'
  import {
    hasPendingSyncWork,
    initAutoSyncOnNetworkRestore,
    isAutoSyncCompleteMessage,
    runBackgroundAutoSync,
    scheduleAutoSync,
  } from '@/services/autoSync.service'
  import { isOnline, onNetworkStatusChange } from '@/services/networkReachability.service'
  import {
    dismissOverdueReminder,
    groupOverdueIncompleteEvents,
    isOverdueReminderDismissed,
  } from '@/services/calendarOverdueReminder.service'
  import {
    listConflictBackups,
    removeConflictBackup,
    type ConflictBackupEntry,
  } from '@/utils/syncConflict'
  import { decryptField, isEncryptedEnvelope, parseEnvelopeV2 } from '@/utils/secureCrypto'
  import {
    ACCOUNT_DEK_SESSION_KEY,
    ACCOUNT_STATUS_SESSION_KEY,
    clearAccountSession,
  } from '@/utils/accountSession'
  import {
    clearNoteDraft,
    readNoteDraft,
    shouldApplyDraft,
  } from '@/services/noteDraft.service'

  useCommitPendingDeletesOnClose()

  const auth = useAuthStore()
  const { isAuthenticated } = storeToRefs(auth)
  const folders = useFoldersStore()
  const notes = useNotesStore()
  const secure = useSecureFolderStore()
  const account = useAccountCryptoStore()
  const sync = useSyncStore()
  const langStore = useLangStore()
  const { t } = langStore
  const calendarEvents = useCalendarEventsStore()
  const dataReady = ref(false)
  const networkOnline = ref(isOnline())
  const showSettings = ref(false)
  const activeTab = ref<'notes' | 'bookmarks' | 'calendar'>('calendar')
  const renamingFolderId = ref<string | null>(null)
  const renamingNoteId = ref<string | null>(null)

  const { colW2, onResizeStart } = useColumnResize()

  const showLoginModal = ref(false)
  const showOverdueReminder = ref(false)
  const conflictBackups = ref<ConflictBackupEntry[]>([])
  const showConflictBackups = ref(false)

  let stopAutoSyncListener: (() => void) | null = null
  let accountStatusTimer: ReturnType<typeof setInterval> | null = null
  let stopNetworkListener: (() => void) | null = null

  /** S2C1.5: trạng thái mã hóa cũ hơn mức này → hỏi lại server khi refresh. */
  const ACCOUNT_STATUS_MAX_AGE_MS = 5 * 60_000

  async function refreshStoresFromNetwork(): Promise<void> {
    if (!isOnline()) return
    // Mount lúc offline thì chưa biết account có mã hóa không (hoặc chỉ biết qua bản session), hoặc
    // trạng thái đã cũ (bật mã hóa ở máy khác) — hỏi lại server trước khi push.
    const statusOld = account.statusAgeMs() > ACCOUNT_STATUS_MAX_AGE_MS
    if (!account.fetched || account.stale || statusOld) await refreshAccountCryptoStatus()
    // Chốt delete còn treo (offline-delete đã hết undo window) trước khi pull — tránh row hiện lại tạm thời.
    await flushOrphanedPendingDeleteCommits('respect-expiry')
    // Push dirty rows + entry local-first LÊN cloud trước, rồi mới pull — tránh pull đè offline edits.
    await runBackgroundAutoSync('pre-pull')
    await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
    // Row có entry pending-delete chưa hết hạn: server chưa xóa nên pull mang nó về lại —
    // ẩn khỏi state để không "hồi sinh" trong UI (context sở hữu undo window tự quyết số phận nó).
    await suppressUnexpiredPendingDeletes()
  }

  async function suppressUnexpiredPendingDeletes(): Promise<void> {
    const pending = await listUnexpiredPendingDeletes()
    if (pending.length === 0) return
    const noteIds = new Set(pending.filter((p) => p.kind === 'note').map((p) => p.entityId))
    const calendarIds = new Set(
      pending.filter((p) => p.kind === 'calendar').map((p) => p.entityId),
    )
    if (noteIds.size > 0) {
      notes.notes = notes.notes.filter((n) => !noteIds.has(n.id))
      notes.bodies = notes.bodies.filter((b) => !noteIds.has(b.note_id))
    }
    if (calendarIds.size > 0) {
      calendarEvents.events = calendarEvents.events.filter((e) => !calendarIds.has(e.id))
    }
    if (noteIds.size > 0 || calendarIds.size > 0) {
      // N3.1: loadAll vừa persist row sắp-xóa xuống đĩa — ghi lại cache KHÔNG chứa nó,
      // để context mới hydrate không hồi sinh note đang chờ undo. An toàn với N5 merge:
      // row đĩa SẠCH vắng trong snapshot → drop; Undo ở context sở hữu sẽ persist lại row.
      await Promise.all([notes.persistCache(), calendarEvents.persistCache()])
    }
  }

  function onAutoSyncMessage(
    msg: unknown,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: unknown) => void,
  ): void {
    if (!isAutoSyncCompleteMessage(msg)) return
    void refreshStoresFromNetwork().then(() => {
      if (sync.status !== 'syncing') {
        sync.markSynced()
      }
    })
  }

  const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null)
  const noteEditorRef = ref<InstanceType<typeof NoteEditor> | null>(null)

  const loadErrorLine = computed(() => {
    const raw = (notes.loadError || folders.loadError)?.trim()
    if (!raw) return ''
    if (/failed to fetch|networkerror|network request failed/i.test(raw)) {
      return t('app.errorConnect')
    }
    return `${t('common.error')} ${raw}`
  })

  function isTypingInEditorOrInput(t: EventTarget | null): boolean {
    if (!t || !(t instanceof HTMLElement)) return false
    const tag = t.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true
    if (t.isContentEditable) return true
    if (t.closest('.ProseMirror') || t.closest('.note-editor__prose')) return true
    return false
  }

  function onGlobalKeydown(e: KeyboardEvent): void {
    if (e.key === 'F2') {
      if (isTypingInEditorOrInput(e.target)) return
      e.preventDefault()
      if (notes.activeNoteId) {
        renamingNoteId.value = notes.activeNoteId
        renamingFolderId.value = null
        return
      }
      if (folders.activeFolderId) {
        renamingFolderId.value = folders.activeFolderId
        renamingNoteId.value = null
      }
      return
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      if (activeTab.value === 'calendar') calendarEvents.requestSearchFocus()
      else searchBarRef.value?.focusInput()
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'n') {
      e.preventDefault()
      const fid = folders.activeFolderId
      if (!fid || secure.isFolderLocked(fid)) return
      void notes.createNote(fid)
    }
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void noteEditorRef.value?.flushSave()
    }
  }

  onMounted(async () => {
    window.addEventListener('keydown', onGlobalKeydown, true)
    await langStore.loadLang()
    // Chốt xóa ĐÃ HẾT HẠN trước khi pull; entry chưa hết hạn có thể thuộc undo window
    // đang sống ở dashboard-tab khác — không được force (N4).
    await flushOrphanedPendingDeleteCommits('respect-expiry')
    // Hiện UI ngay từ cache; refresh network chạy nền (tránh treo popup khi Supabase chậm).
    await Promise.all([
      folders.hydrateFromCache(),
      notes.hydrateFromCache(),
      calendarEvents.hydrateFromCache(),
    ])
    dataReady.value = true
    chrome.storage.onChanged.addListener(onAccountSessionChanged)
    // Không có ai đăng nhập → không được còn trạng thái/DEK account trong session.
    if (auth.initialized && !isAuthenticated.value) await clearAccountSession()
    await refreshAccountCryptoStatus()
    // S2C1.5: draft là plaintext — chỉ áp SAU khi biết account có mã hóa không (và đã restore /
    // mở khóa nếu có). Còn khóa → updateBody từ chối, draft giữ nguyên, áp lại sau khi mở khóa.
    await maybeRestoreNoteDraft()
    // S2C1.6: popup/tab mở lâu — hỏi lại trạng thái mã hóa định kỳ (bật ở máy khác; lần kiểm tra
    // trước lỗi → ghi đang giữ ở máy sẽ được đẩy khi biết trạng thái).
    accountStatusTimer = setInterval(() => {
      if (isOnline() && isAuthenticated.value && account.statusAgeMs() > ACCOUNT_STATUS_MAX_AGE_MS) {
        void refreshAccountCryptoStatus()
      }
    }, 60_000)
    void refreshStoresFromNetwork().then(() => {
      void maybeShowOverdueReminder()
      void maybeShowConflictBackups()
    })
    stopAutoSyncListener = initAutoSyncOnNetworkRestore()
    stopNetworkListener = onNetworkStatusChange((online) => {
      networkOnline.value = online
      if (online) void refreshStoresFromNetwork()
    })
    chrome.runtime.onMessage.addListener(onAutoSyncMessage)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown, true)
    stopAutoSyncListener?.()
    stopNetworkListener?.()
    chrome.runtime.onMessage.removeListener(onAutoSyncMessage)
    chrome.storage.onChanged.removeListener(onAccountSessionChanged)
    if (accountStatusTimer) clearInterval(accountStatusTimer)
  })

  watch(isAuthenticated, (authed) => {
    if (authed) {
      void maybeShowOverdueReminder()
      void maybeShowConflictBackups()
      // Login qua LoginModal không remount trang — phải tự nạp trạng thái mã hóa của account mới.
      void refreshAccountCryptoStatus()
    } else {
      // Session mất ngoài onLogout (token thu hồi, logout ở máy khác / context khác).
      // S2C1.5: khóa ĐÚNG quy trình (seal + nạp lại RAM) TRƯỚC khi quên trạng thái — còn key thì
      // flush editor / persist đều mã hóa. S2C1.6: chỉ quên khi chưa ai đăng nhập lại (clearStatus
      // muộn không được xóa trạng thái của phiên mới); lockAccountNow không bao giờ ném.
      void (async () => {
        await lockAccountNow({ clearSession: false })
        if (!isAuthenticated.value) account.clearStatus()
      })()
    }
  })

  /**
   * S2C1: trạng thái encrypted-account phải khớp session hiện tại. Lỗi mạng KHÔNG được làm
   * sập phần còn lại của onMounted — để fetched=false, refreshStoresFromNetwork thử lại.
   */
  async function refreshAccountCryptoStatus(): Promise<void> {
    if (!isAuthenticated.value) return
    try {
      await account.refreshStatus()
    } catch (e) {
      console.warn('[BBQOne] Account encryption status check failed:', e)
      return
    }
    // S2C1.4/1.6: lúc trạng thái còn chưa biết, ghi được giữ lại ở máy (local-first + dirty row) —
    // giờ biết rồi thì đẩy (có key → v2; khóa → vẫn giữ).
    if (await hasPendingSyncWork()) scheduleAutoSync('account-status')
    // Draft bị bỏ qua lúc chưa biết trạng thái — giờ áp được nếu không cần mở khóa.
    if (!account.isEnabled()) void maybeRestoreNoteDraft()
    if (!account.isEnabled() || account.isUnlocked()) return
    // S2C1.3: mở lại popup trong phiên → DEK còn trong chrome.storage.session, không hỏi lại.
    if (await account.restoreFromSession()) {
      await account.decryptLoadedAccountRows()
      scheduleAutoSync('account-unlocked')
      void maybeRestoreNoteDraft()
      return
    }
    account.unlockModalOpen = true
  }

  /**
   * S2C1.3: popup và tab dùng chung DEK trong chrome.storage.session — một nơi khóa (hoặc hết
   * hạn tự khóa) thì mọi nơi khóa; một nơi mở khóa thì nơi khác mở theo.
   */
  function onAccountSessionChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void {
    if (area !== 'session') return
    // S2C1.5: bật / tắt mã hóa ở context khác (popup ↔ tab) → hỏi lại ngay, đừng đợi tới lần
    // refresh sau mà đẩy plaintext. Chỉ phản ứng khi khác trạng thái đang giữ (không lặp vòng).
    if (ACCOUNT_STATUS_SESSION_KEY in changes) {
      const next = changes[ACCOUNT_STATUS_SESSION_KEY].newValue as { row?: unknown } | undefined
      if (next && !!next.row !== account.isEnabled()) void refreshAccountCryptoStatus()
    }
    if (!(ACCOUNT_DEK_SESSION_KEY in changes)) return
    const removed = changes[ACCOUNT_DEK_SESSION_KEY].newValue === undefined
    if (removed) {
      if (account.isUnlocked()) void lockAccountNow({ clearSession: false })
      return
    }
    if (!account.isEnabled() || account.isUnlocked()) return
    void account.restoreFromSession().then(async (ok) => {
      if (!ok) return
      account.unlockModalOpen = false
      await onAccountUnlocked()
    })
  }

  /** "Khóa ngay" / hết hạn: lưu edit đang chờ (còn key) → đóng ghi chú → khóa. */
  async function lockAccountNow(opts: { clearSession?: boolean } = {}): Promise<void> {
    try {
      await noteEditorRef.value?.flushSave()
    } catch {
      /* draft vẫn nằm trong chrome.storage.session (C8.1) */
    }
    notes.selectNote(null)
    // S2C1.6: không bao giờ ném — logout / mất session phải đi tiếp dù khóa gặp lỗi (lockNow vẫn
    // bỏ key trong `finally`).
    try {
      await account.lockNow(opts)
    } catch (e) {
      console.error('[BBQOne] Account lock failed:', e)
    }
    // S2C1.5: lockNow nạp lại RAM từ đĩa — secure folder đang mở phải overlay lại (v1 key riêng).
    try {
      await secure.decryptLoadedSecureRows()
    } catch (e) {
      console.warn('[BBQOne] Secure folder re-open after lock failed:', e)
    }
  }

  /** Anonymous: chưa đăng nhập */
  const isAnonymous = computed(() => !isAuthenticated.value)

  async function onLogout(): Promise<void> {
    // S2C1.6: chốt các xóa đang chờ Undo khi còn đăng nhập — Undo sau logout sẽ khôi phục ghi chú
    // của account vào local mode.
    await useUndoToastStore().commitAllPending().catch((e: unknown) => {
      console.warn('[BBQOne] Commit pending deletes before logout failed:', e)
    })
    // S2C1.5: seal + nạp lại RAM khi còn key, rồi mới quên trạng thái (xem watch(isAuthenticated)).
    await lockAccountNow({ clearSession: false })
    secure.lockAll()
    account.lock()
    account.clearStatus()
    await auth.logout()
    // Sau khi logout: ở lại dashboard ở local mode, reload data từ local storage
    await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
  }

  function onGoLogin(): void {
    showLoginModal.value = true
  }

  async function onAccountUnlocked(): Promise<void> {
    await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
    // S2C1.5: draft bị từ chối lúc còn khóa → giờ áp được (mã hóa v2).
    await maybeRestoreNoteDraft()
    // S2C1.4: row plaintext bị giữ lại lúc khóa → giờ có key, đẩy lên dạng v2.
    scheduleAutoSync('account-unlocked')
    // Backup đang hiện dạng "đã mã hóa" → giờ có key, mở lại từ storage.
    if (conflictBackups.value.length > 0) {
      conflictBackups.value = await openConflictBackupsForView(await listConflictBackups())
    }
  }

  function onAccountUnlockClose(): void {
    account.unlockModalOpen = false
  }

  async function onLoginSuccess(): Promise<void> {
    showLoginModal.value = false
    // Reload data từ cloud sau khi đăng nhập thành công
    await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
    await maybeShowOverdueReminder()
  }

  const syncBusy = computed(() => sync.status === 'syncing')

  /** Xanh khi vừa đồng bộ thành công (store = synced); mặc định khi idle. */
  const syncBadgeVariant = computed((): CloudSyncVariant => {
    if (!networkOnline.value && (notes.isDirty || sync.status === 'error')) return 'unsaved'
    if (sync.status === 'syncing') return 'syncing'
    if (notes.isDirty) return 'unsaved'
    if (sync.status === 'error') return 'error'
    if (sync.status === 'synced') return 'done'
    return 'idle'
  })

  async function onSync(): Promise<void> {
    if (syncBusy.value) return
    if (!networkOnline.value) return
    try {
      await sync.runManualSync()
    } catch {
      /* lastError set in store */
    }
  }

  const syncBadgeTitle = computed(() => {
    if (!networkOnline.value) {
      if (notes.isDirty) return t('app.sync.titleOfflinePending')
      return t('app.sync.titleOffline')
    }
    if (syncBusy.value) return t('app.sync.titleSyncing')
    const err = sync.lastError?.trim()
    if (sync.status === 'error' && err) return `${err} — ${t('app.sync.titleFailed')}`
    if (sync.status === 'error') return t('app.sync.titleFailed')
    return t('app.sync.titleReady')
  })

  /** Khi đang gõ SEARCH: chỉ hiện FOLDERS + NOTES, ẩn BODY để không lệch với note đang mở trước đó. */
  const isSearchActive = computed(() => notes.searchQuery.trim().length > 0)

  const noteListColumnStyle = computed(() =>
    isSearchActive.value
      ? { flex: '1 1 auto', minWidth: `${colW2.value}px` }
      : { width: `${colW2.value}px` },
  )

  const overdueGroups = computed(() =>
    groupOverdueIncompleteEvents(calendarEvents.events),
  )

  async function maybeShowOverdueReminder(): Promise<void> {
    if (!dataReady.value || !isAuthenticated.value) return
    if (showOverdueReminder.value) return
    if (await isOverdueReminderDismissed()) return
    if (overdueGroups.value.length === 0) return
    showOverdueReminder.value = true
  }

  async function closeOverdueReminder(): Promise<void> {
    showOverdueReminder.value = false
    await dismissOverdueReminder()
  }

  async function onOverdueReminderConfirm(checkedIds: string[]): Promise<void> {
    if (checkedIds.length > 0) {
      await calendarEvents.markEventsDone(checkedIds)
    }
    await closeOverdueReminder()
  }

  function onOverdueReminderClose(): void {
    void closeOverdueReminder()
  }

  let draftRestoring = false
  async function maybeRestoreNoteDraft(): Promise<void> {
    // S2C1.6: draft là plaintext — chưa biết account có mã hóa không thì CHƯA áp (áp lúc này sẽ ghi
    // rõ xuống đĩa). Giữ nguyên draft; áp khi biết trạng thái / mở khóa.
    if (isAuthenticated.value && !account.fetched) return
    if (draftRestoring) return
    draftRestoring = true
    try {
      await restoreNoteDraftNow()
    } finally {
      draftRestoring = false
    }
  }

  async function restoreNoteDraftNow(): Promise<void> {
    const draft = await readNoteDraft()
    if (!draft) return
    const body = notes.bodies.find((b) => b.id === draft.bodyId)
    if (!shouldApplyDraft(draft, body)) {
      await clearNoteDraft()
      return
    }
    try {
      await notes.updateBody(draft.bodyId, { content: draft.content })
      await clearNoteDraft()
    } catch (e) {
      console.error('[BBQOne] Note draft restore failed:', e)
    }
  }

  async function maybeShowConflictBackups(): Promise<void> {
    if (!isAuthenticated.value) return
    conflictBackups.value = await openConflictBackupsForView(await listConflictBackups())
    if (conflictBackups.value.length > 0) showConflictBackups.value = true
  }

  /**
   * S2C1.2: backup lưu bản đã mã hóa. Account mở khóa → giải mã field v2 để hiển thị/khôi phục
   * (chỉ trong RAM). Field không mở được (khóa, secure folder v1) giữ nguyên envelope →
   * dialog che đi và entry không được Restore.
   */
  async function openConflictBackupsForView(
    list: ConflictBackupEntry[],
  ): Promise<ConflictBackupEntry[]> {
    const key = account.getContentKey()
    if (!key) return list
    const out: ConflictBackupEntry[] = []
    for (const entry of list) {
      if (entry.kind === 'calendar') {
        out.push(entry)
        continue
      }
      const row = { ...entry.row }
      for (const field of ['title', 'label', 'content'] as const) {
        const value = row[field]
        if (typeof value !== 'string' || !parseEnvelopeV2(value)) continue
        try {
          row[field] = await decryptField(value, key)
        } catch {
          /* key khác / hỏng → giữ envelope, entry thành không-Restore-được */
        }
      }
      out.push({ ...entry, row })
    }
    return out
  }

  function hasEnvelopeField(row: Record<string, unknown>): boolean {
    return ['title', 'label', 'content'].some(
      (f) => typeof row[f] === 'string' && isEncryptedEnvelope(row[f] as string),
    )
  }

  const restorableBackupIds = computed(() => {
    const ids = new Set<string>()
    for (const e of conflictBackups.value) {
      const rowId = String(e.row.id ?? '')
      if (!rowId) continue
      if (e.kind === 'calendar') {
        if (calendarEvents.events.some((ev) => ev.id === rowId)) ids.add(e.id)
        continue
      }
      // Restore một envelope = mã hóa chồng → hỏng ghi chú. Mở khóa xong mới Restore được.
      if (hasEnvelopeField(e.row)) continue
      const noteId = e.kind === 'note' ? rowId : String(e.row.note_id ?? '')
      const note = notes.notes.find((n) => n.id === noteId)
      if (!note) continue
      if (e.kind === 'note_body' && !notes.bodies.some((b) => b.id === rowId)) continue
      const folder = note.folder_id ? folders.folders.find((f) => f.id === note.folder_id) : null
      if (folder?.is_secure) continue
      ids.add(e.id)
    }
    return ids
  })

  async function onConflictBackupRestore(entry: ConflictBackupEntry): Promise<void> {
    const rowId = String(entry.row.id ?? '')
    if (entry.kind !== 'calendar' && hasEnvelopeField(entry.row)) return
    try {
      if (entry.kind === 'note') {
        await notes.updateNote(rowId, {
          title: String(entry.row.title ?? ''),
          tags: Array.isArray(entry.row.tags) ? (entry.row.tags as string[]) : [],
        })
      } else if (entry.kind === 'note_body') {
        await notes.updateBody(rowId, {
          label: String(entry.row.label ?? ''),
          content: String(entry.row.content ?? ''),
        })
      } else {
        await calendarEvents.updateEvent(rowId, {
          title: String(entry.row.title ?? ''),
          description: String(entry.row.description ?? ''),
          is_done: Boolean(entry.row.is_done),
        })
      }
      await removeConflictBackup(entry.id)
      conflictBackups.value = conflictBackups.value.filter((e) => e.id !== entry.id)
    } catch (e) {
      console.error('[BBQOne] Conflict backup restore failed:', e)
    }
    if (conflictBackups.value.length === 0) showConflictBackups.value = false
  }

  async function onConflictBackupDismiss(entry: ConflictBackupEntry): Promise<void> {
    await removeConflictBackup(entry.id)
    conflictBackups.value = conflictBackups.value.filter((e) => e.id !== entry.id)
    if (conflictBackups.value.length === 0) showConflictBackups.value = false
  }

  function onOpenCalendarFromTodayBanner(): void {
    activeTab.value = 'calendar'
    calendarEvents.focusCalendarCellFromSearch(todayLocalKey())
  }
</script>

<template>
  <div class="shell shell--dashboard">
    <header class="shell__header">
      <div class="shell__header-row shell__header-row--top">
        <div class="shell__header-left">
          <span class="shell__brand">BBQOne</span>
          <span class="shell__brand-sep" aria-hidden="true" />
          <nav class="shell__tabs" role="tablist" :aria-label="t('app.tabs.aria')">
            <RetroButton
              variant="sm"
              type="button"
              role="tab"
              :class="activeTab === 'calendar' ? 'shell__tab-btn--active' : ''"
              :aria-selected="activeTab === 'calendar'"
              @click="activeTab = 'calendar'"
            >
              {{ t('app.tabs.calendar') }}
            </RetroButton>
            <RetroButton
              variant="sm"
              type="button"
              role="tab"
              :class="activeTab === 'notes' ? 'shell__tab-btn--active' : ''"
              :aria-selected="activeTab === 'notes'"
              @click="activeTab = 'notes'"
            >
              {{ t('app.tabs.notes') }}
            </RetroButton>
            <RetroButton
              variant="sm"
              type="button"
              role="tab"
              :class="activeTab === 'bookmarks' ? 'shell__tab-btn--active' : ''"
              :aria-selected="activeTab === 'bookmarks'"
              @click="activeTab = 'bookmarks'"
            >
              {{ t('app.tabs.bookmark') }}
            </RetroButton>
          </nav>
        </div>
        <span class="shell__sep" aria-hidden="true"></span>
        <div class="shell__header-right">
          <ThemeModeToggle class="shell__theme-toggle" />
          <!-- Cloud sync badge: chỉ hiện khi đã đăng nhập -->
          <CloudSyncStatusBadge
            v-if="!isAnonymous"
            :variant="syncBadgeVariant"
            :label="syncBadgeTitle"
            :disabled="syncBusy"
            @click="onSync"
          />
          <!-- Local pending badge: chỉ hiện khi anonymous -->
          <SyncStatusBadge v-if="isAnonymous" @sign-in="onGoLogin" />
          <IconButton
            variant="default"
            :label="t('app.aria.settings')"
            :title="t('app.aria.settings')"
            @click="showSettings = true"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              />
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              />
            </svg>
          </IconButton>
          <IconButton
            v-if="isAnonymous"
            variant="accent"
            :label="t('app.aria.login')"
            :title="t('app.aria.loginTitle')"
            @click="onGoLogin"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8 10V7a4 4 0 0 1 8 0v3"
              />
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 10h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9Z"
              />
              <circle cx="12" cy="15" r="1" fill="currentColor" />
            </svg>
          </IconButton>
          <IconButton
            v-else
            variant="default"
            :label="t('app.aria.logout')"
            :title="t('app.aria.logoutTitle')"
            @click="onLogout"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
              />
            </svg>
          </IconButton>
        </div>
      </div>
      <CalendarTodayBanner
        v-if="dataReady"
        @open-calendar="onOpenCalendarFromTodayBanner"
      />
      <!-- U2: tab Calendar tìm kiếm trong hàng điều hướng tháng (CalendarInlineSearch). -->
      <SearchBar
        v-if="activeTab !== 'calendar'"
        ref="searchBarRef"
        :search-mode="activeTab === 'bookmarks' ? 'bookmarks' : 'notes'"
      />
    </header>

    <OfflineBanner />

    <p v-if="loadErrorLine" class="shell__error" role="alert">
      {{ loadErrorLine }}
    </p>

    <template v-if="dataReady">
      <!-- Tab: Notes (layout 3 cột hiện tại) -->
      <div v-show="activeTab === 'notes'" class="shell__grid">
        <Sidebar
          v-model:renaming-folder-id="renamingFolderId"
          class="shell__col shell__col--folders"
        />
        <NoteList
          v-model:renaming-note-id="renamingNoteId"
          class="shell__col shell__col--notes"
          :class="{ 'shell__col--notes--search': isSearchActive }"
          :style="noteListColumnStyle"
        />
        <div
          v-show="!isSearchActive"
          class="shell__resize"
          :title="t('app.dragResize')"
          aria-hidden="true"
          @mousedown="onResizeStart($event)"
        />
        <div v-show="!isSearchActive" class="shell__col shell__col--editor">
          <NoteEditor ref="noteEditorRef" />
        </div>
      </div>

      <!-- Tab: Bookmark — chỉ mount khi user mở tab (modal PIN không phủ lên Notes). -->
      <div v-if="activeTab === 'bookmarks'" class="shell__grid shell__grid--full">
        <BookmarkTab class="shell__col--full" />
      </div>

      <div v-if="activeTab === 'calendar'" class="shell__grid shell__grid--full">
        <CalendarTab class="shell__col--full" />
      </div>
    </template>
    <DashboardSkeleton v-else class="shell__loading-skel" />

    <SettingsModal
      v-if="showSettings"
      @close="showSettings = false"
      @lock-account="lockAccountNow()"
    />

    <!-- Login popup: hiện ngay trên dashboard thay vì navigate sang trang riêng -->
    <LoginModal v-if="showLoginModal" @close="showLoginModal = false" @success="onLoginSuccess" />

    <AccountUnlockModal
      :open="account.unlockModalOpen"
      @close="onAccountUnlockClose"
      @done="onAccountUnlocked"
    />

    <CalendarOverdueReminderDialog
      :visible="showOverdueReminder"
      :groups="overdueGroups"
      @close="onOverdueReminderClose"
      @confirm="onOverdueReminderConfirm"
    />
    <ConflictBackupsDialog
      :visible="showConflictBackups"
      :entries="conflictBackups"
      :restorable-ids="restorableBackupIds"
      @restore="onConflictBackupRestore"
      @dismiss="onConflictBackupDismiss"
      @close="showConflictBackups = false"
    />
    <UndoToast />
  </div>
</template>

<style scoped>
  .shell {
    display: flex;
    flex-direction: column;
    /* Độ rộng tối thiểu popup: global.css (--popup-min-width); lưới có overflow-x khi hẹp hơn 3 cột */
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    max-height: 100%;
    overflow: hidden;
    background: var(--bg-primary);
  }

  /* Dashboard: accent xanh + wash rất nhẹ (spec: tránh gradient trang trí — chỉ tinh chỉnh header) */
  .shell--dashboard {
    --accent: var(--accent-dashboard);
    --search-hit-bg: var(--search-hit-dashboard);
    background-color: var(--bg-primary);
    background-image: radial-gradient(
      ellipse 130% 90% at 50% 0%,
      var(--bg-dashboard-radial) 0%,
      transparent 55%
    );
  }

  .shell__header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--border);
    font-size: var(--font-size-sm);
    flex: 0 0 auto;
  }

  .shell--dashboard .shell__header {
    background:
      linear-gradient(180deg, var(--bg-dashboard-header-wash) 0%, transparent 72%),
      var(--bg-secondary);
    box-shadow:
      0 1px 0 var(--border),
      0 10px 28px var(--panel-ring);
  }

  .shell__header-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .shell__header-row--top {
    flex-wrap: nowrap;
    align-items: center;
    min-width: 0;
    gap: 10px;
    min-height: 36px;
  }

  .shell__header-left {
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    min-width: 0;
    gap: 10px;
  }

  .shell__brand-sep {
    flex: 0 0 auto;
    align-self: center;
    width: 1px;
    height: 24px;
    background: var(--border);
  }

  .shell__tabs {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 3px;
    min-width: 0;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--bg-panel) 74%, var(--bg-secondary));
    box-shadow: inset 0 1px 0 var(--bg-secondary);
  }

  /* Tab chính dạng segmented control: rõ affordance nhưng nhẹ hơn nút action. */
  .shell__tabs :deep(.retro-btn) {
    min-width: auto;
    min-height: 28px;
    padding: 5px 16px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    font-weight: 600;
    letter-spacing: -0.012em;
    box-shadow: none;
  }

  .shell__tabs :deep(.retro-btn:hover:not(:disabled)) {
    color: var(--accent);
    border-color: transparent;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  /* Icon toolbar bên phải */
  .shell__header-right {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex: 0 0 auto;
    min-width: 0;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
  }

  .shell__brand {
    flex: 0 0 auto;
    font-size: 17px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: -0.035em;
    white-space: nowrap;
  }

  .shell__sep {
    flex: 1 1 32px;
    min-width: 0;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shell__theme-toggle {
    flex-shrink: 0;
  }

  .shell__error {
    margin: 0;
    padding: 8px 12px;
    font-size: var(--font-size-sm);
    color: var(--danger);
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    letter-spacing: 0.04em;
  }

  .shell__grid {
    flex: 1 1 auto;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    min-height: 0;
    min-width: 0;
    /* Cột có width cố định; popup hẹp thì cuộn ngang thay vì cắt mất chữ */
    overflow-x: auto;
    overflow-y: hidden;
  }

  .shell__col--folders {
    flex: 0 0 180px;
    width: 180px;
    min-width: 180px;
    min-height: 0;
    overflow: hidden;
  }

  .shell__col--notes {
    flex-shrink: 0;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .shell__col--notes--search {
    flex-shrink: 1;
  }

  .shell__resize {
    flex: 0 0 5px;
    width: 5px;
    cursor: col-resize;
    align-self: stretch;
    background: transparent;
    z-index: 2;
  }

  .shell__resize:hover,
  .shell__resize:active {
    background: var(--accent);
    opacity: 0.35;
  }

  .shell__col--editor {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 120px;
    min-height: 0;
    background: var(--bg-primary);
  }

  .shell__loading {
    flex: 1 1 auto;
    margin: 0;
    padding: 16px 12px;
  }

  .shell__loading-skel {
    flex: 1 1 auto;
    min-height: 0;
  }

  .shell__grid--full {
    flex-direction: column;
  }

  .shell__col--full {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .shell__tab-btn--active {
    border-color: var(--accent) !important;
    color: var(--on-accent) !important;
    background: var(--accent) !important;
    font-weight: 700;
    box-shadow:
      0 1px 2px var(--panel-ring),
      inset 0 1px 0 color-mix(in srgb, var(--on-accent) 24%, transparent);
  }

  .shell__tab-btn--active:hover:not(:disabled) {
    color: var(--on-accent) !important;
    background: var(--color-primary-focus) !important;
    border-color: var(--color-primary-focus) !important;
  }

  .shell__sep-v {
    color: var(--border);
    padding: 0 2px;
  }
</style>
