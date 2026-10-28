<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import NoteEditor from '@/components/notes/NoteEditor.vue'
  import NoteList from '@/components/layout/NoteList.vue'
  import SettingsModal from '@/components/layout/SettingsModal.vue'
  import Sidebar from '@/components/layout/Sidebar.vue'
  import BookmarkTab from '@/components/bookmarks/BookmarkTab.vue'
  import CalendarTab from '@/components/calendar/CalendarTab.vue'
  import CalendarAgendaChip from '@/components/calendar/CalendarAgendaChip.vue'
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
  import { useBookmarksStore } from '@/stores/bookmarks'
  import CloudSyncStatusBadge from '@/components/sync/CloudSyncStatusBadge.vue'
  import type { CloudSyncVariant } from '@/components/sync/CloudSyncStatusBadge.vue'
  import SyncStatusBadge from '@/components/sync/SyncStatusBadge.vue'
  import ThemeModeToggle from '@/components/ui/ThemeModeToggle.vue'
  import UndoToast from '@/components/ui/UndoToast.vue'
  import { useUndoToastStore } from '@/stores/undoToast'
  import DashboardSkeleton from '@/components/ui/DashboardSkeleton.vue'
  import OfflineBanner from '@/components/ui/OfflineBanner.vue'
  import AppIcon from '@/components/ui/AppIcon.vue'
  import {
    hasPendingSyncWork,
    initAutoSyncOnNetworkRestore,
    isAutoSyncCompleteMessage,
    runBackgroundAutoSync,
    scheduleAutoSync,
  } from '@/services/autoSync.service'
  import { isOnline, onNetworkStatusChange } from '@/services/networkReachability.service'
  import { groupOverdueIncompleteEvents } from '@/services/calendarOverdueReminder.service'
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
  const bookmarks = useBookmarksStore()
  const dataReady = ref(false)
  const networkOnline = ref(isOnline())
  const showSettings = ref(false)
  const activeTab = ref<'notes' | 'bookmarks' | 'calendar'>('calendar')
  /** U16 / U20: 3 mục chính — trên thanh dọc bên trái, chỉ icon (tên ở tooltip / bảng mở rộng). */
  const HEADER_TABS = [
    { id: 'calendar', label: 'app.tabs.calendar', icon: 'calendar' },
    { id: 'notes', label: 'app.tabs.notes', icon: 'notes' },
    { id: 'bookmarks', label: 'app.tabs.bookmark', icon: 'bookmark' },
  ] as const
  const tabsRef = ref<HTMLElement | null>(null)

  /** Mẫu tablist dọc: ↑ ↓ (và ← →) / Home / End chuyển mục + dời focus (roving tabindex). */
  function onTabsKeydown(e: KeyboardEvent): void {
    const n = HEADER_TABS.length
    const i = HEADER_TABS.findIndex((tab) => tab.id === activeTab.value)
    let next: number
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % n
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else return
    e.preventDefault()
    activeTab.value = HEADER_TABS[next].id
    void nextTick(() => tabsRef.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus())
  }

  /**
   * U20: bảng mở rộng của thanh dọc — NỔI ĐÈ (không đẩy nội dung: popup chỉ 800 px). Đóng khi chọn mục,
   * Esc hoặc bấm ra ngoài; Esc / ☰ trả focus về nút ☰.
   */
  const railOpen = ref(false)
  const railMenuRef = ref<HTMLButtonElement | null>(null)
  const drawerRef = ref<HTMLElement | null>(null)

  function openRail(): void {
    railOpen.value = true
    void nextTick(() => drawerRef.value?.querySelector<HTMLButtonElement>('.shell__drawer-item--active')?.focus())
  }

  function closeRail(returnFocus: boolean): void {
    railOpen.value = false
    if (returnFocus) void nextTick(() => railMenuRef.value?.focus())
  }

  function selectTab(id: (typeof HEADER_TABS)[number]['id']): void {
    activeTab.value = id
    closeRail(false)
  }

  function onDrawerKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    closeRail(true)
  }
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
    if (!account.fetched || account.stale || statusOld) await refreshAccountCryptoStatus(false)
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
      // U5: mỗi tab có ô 🔍 riêng trong thanh công cụ của nó.
      if (activeTab.value === 'calendar') calendarEvents.requestSearchFocus()
      else if (activeTab.value === 'bookmarks') bookmarks.requestSearchFocus()
      else notes.requestSearchFocus()
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
        void refreshAccountCryptoStatus(false)
      }
    }, 60_000)
    void refreshStoresFromNetwork().then(() => {
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
   * S2C1.7: `promptUnlock=false` (hỏi lại định kỳ / sau auto-sync) chỉ nhắc mở khóa khi lần này
   * mới biết account bật mã hóa — không mở lại modal user đã đóng.
   */
  async function refreshAccountCryptoStatus(promptUnlock = true): Promise<void> {
    if (!isAuthenticated.value) return
    const knewEnabled = account.isEnabled()
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
    if (promptUnlock || !knewEnabled) account.unlockModalOpen = true
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

  // U12: hộp thoại quá hạn KHÔNG tự bật nữa — mở từ chip lịch ("Đánh dấu xong"). Đóng / xác nhận chỉ
  // ẩn hộp thoại; chip vẫn đếm phần còn lại (computed theo calendar.events).
  async function onOverdueReminderConfirm(checkedIds: string[]): Promise<void> {
    if (checkedIds.length > 0) {
      await calendarEvents.markEventsDone(checkedIds)
    }
    showOverdueReminder.value = false
  }

  function onOverdueReminderClose(): void {
    showOverdueReminder.value = false
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

  /** U6: bấm chip lịch / một sự kiện trong bảng → tab Lịch, nhảy đúng ngày đó. */
  async function onOpenCalendarFromAgenda(dateKey: string): Promise<void> {
    // Bỏ ô đang focus trước → bấm lại cùng ngày vẫn cuộn tới; chờ CalendarTab mount (đang ở tab khác)
    // để watch(gridFocusDateKey) của nó bắt được thay đổi.
    calendarEvents.gridFocusDateKey = null
    activeTab.value = 'calendar'
    await nextTick()
    calendarEvents.focusCalendarCellFromSearch(dateKey)
  }
</script>

<template>
  <div class="shell shell--dashboard">
    <!-- U20: thanh điều hướng dọc — thu gọn chỉ icon; ☰ mở bảng nổi đè (icon + chữ). -->
    <nav class="shell__rail">
      <button
        ref="railMenuRef"
        type="button"
        class="shell__rail-btn"
        :aria-label="t('app.rail.expand')"
        :title="t('app.rail.expand')"
        :aria-expanded="railOpen"
        @click="openRail"
      >
        <AppIcon name="menu" :size="20" />
      </button>
      <div
        ref="tabsRef"
        class="shell__rail-items"
        role="tablist"
        aria-orientation="vertical"
        :aria-label="t('app.tabs.aria')"
        @keydown="onTabsKeydown"
      >
        <button
          v-for="tab in HEADER_TABS"
          :key="tab.id"
          type="button"
          role="tab"
          class="shell__rail-btn shell__rail-item"
          :class="{ 'shell__rail-item--active': activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          :tabindex="activeTab === tab.id ? 0 : -1"
          :aria-label="t(tab.label)"
          :title="t(tab.label)"
          @click="activeTab = tab.id"
        >
          <AppIcon :name="tab.icon" :size="20" />
        </button>
      </div>
      <div class="shell__rail-bottom">
        <button
          type="button"
          class="shell__rail-btn"
          :aria-label="t('app.aria.settings')"
          :title="t('app.aria.settings')"
          @click="showSettings = true"
        >
          <AppIcon name="settings" :size="20" />
        </button>
        <!-- U17: 👤 thay ⇤ — ⇤ chỉ là ảnh lật của ⇥ "Đăng xuất", nhìn như một. -->
        <button
          v-if="isAnonymous"
          type="button"
          class="shell__rail-btn shell__rail-btn--accent"
          :aria-label="t('app.aria.login')"
          :title="t('app.aria.loginTitle')"
          @click="onGoLogin"
        >
          <AppIcon name="user" :size="20" />
        </button>
        <button
          v-else
          type="button"
          class="shell__rail-btn"
          :aria-label="t('app.aria.logout')"
          :title="t('app.aria.logoutTitle')"
          @click="onLogout"
        >
          <AppIcon name="log-out" :size="20" />
        </button>
      </div>
    </nav>

    <Transition name="shell-drawer">
      <div v-if="railOpen" class="shell__drawer-scrim" @click.self="closeRail(true)">
        <div
          ref="drawerRef"
          class="shell__drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="t('app.tabs.aria')"
          @keydown="onDrawerKeydown"
        >
          <div class="shell__drawer-head">
            <button
              type="button"
              class="shell__rail-btn"
              :aria-label="t('app.rail.collapse')"
              :title="t('app.rail.collapse')"
              aria-expanded="true"
              @click="closeRail(true)"
            >
              <AppIcon name="menu" :size="20" />
            </button>
            <span class="shell__brand">BBQOne</span>
          </div>
          <button
            v-for="tab in HEADER_TABS"
            :key="tab.id"
            type="button"
            class="shell__drawer-item"
            :class="{ 'shell__drawer-item--active': activeTab === tab.id }"
            :aria-current="activeTab === tab.id ? 'page' : undefined"
            @click="selectTab(tab.id)"
          >
            <AppIcon :name="tab.icon" :size="20" />
            <span>{{ t(tab.label) }}</span>
          </button>
          <div class="shell__drawer-bottom">
            <button type="button" class="shell__drawer-item" @click="closeRail(false); showSettings = true">
              <AppIcon name="settings" :size="20" />
              <span>{{ t('app.aria.settings') }}</span>
            </button>
            <button v-if="isAnonymous" type="button" class="shell__drawer-item" @click="closeRail(false); onGoLogin()">
              <AppIcon name="user" :size="20" />
              <span>{{ t('app.aria.login') }}</span>
            </button>
            <button v-else type="button" class="shell__drawer-item" @click="closeRail(false); onLogout()">
              <AppIcon name="log-out" :size="20" />
              <span>{{ t('app.aria.logout') }}</span>
            </button>
          </div>
        </div>
        <!-- /drawer -->
      </div>
    </Transition>

    <div class="shell__main">
      <header class="shell__header">
        <div class="shell__header-row shell__header-row--top">
          <div class="shell__header-left">
            <span class="shell__brand">BBQOne</span>
          </div>
          <!-- U6: lịch hôm nay / ngày mai gọn trong một chip (thay 2 banner xếp chồng dưới header). -->
          <div class="shell__header-mid">
            <CalendarAgendaChip
              v-if="dataReady"
              @open-calendar="onOpenCalendarFromAgenda"
              @review-overdue="showOverdueReminder = true"
            />
          </div>
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
          </div>
        </div>
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
    </div>

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
  /* U20: hàng ngang = thanh dọc (rail) + cột nội dung (shell__main). */
  .shell {
    position: relative;
    display: flex;
    flex-direction: row;
    /* Bề rộng popup cố định: global.css (--popup-width); lưới có overflow-x khi hẹp hơn 3 cột */
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

  .shell__main {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* —— U20: thanh điều hướng dọc —— */
  .shell__rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 56px;
    gap: 6px;
    padding: 12px 0 12px;
    border-right: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .shell__rail-items {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }

  .shell__rail-bottom {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: auto;
  }

  .shell__rail-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background 0.12s linear,
      color 0.12s linear;
  }

  .shell__rail-btn:hover {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--text-primary) 7%, transparent);
  }

  .shell__rail-btn:focus-visible,
  .shell__drawer-item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  /* Mục đang chọn: viên nền nhấn nhạt + icon màu nhấn (không tô đặc). */
  .shell__rail-item--active,
  .shell__rail-item--active:hover {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }

  .shell__rail-btn--accent {
    color: var(--accent);
    background: var(--surface-accent-muted);
  }

  /* Bảng mở rộng: nổi đè, không đẩy nội dung. */
  .shell__drawer-scrim {
    position: absolute;
    inset: 0;
    z-index: 70;
    background: color-mix(in srgb, #000 22%, transparent);
  }

  .shell__drawer {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 220px;
    padding: 12px 10px;
    border-right: 1px solid var(--border);
    background: var(--bg-panel);
    box-shadow: 8px 0 28px var(--panel-ring);
  }

  .shell__drawer-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px -2px;
  }

  .shell__drawer-item {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 40px;
    padding: 0 14px;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .shell__drawer-item:hover {
    background: color-mix(in srgb, var(--text-primary) 6%, transparent);
  }

  .shell__drawer-item--active,
  .shell__drawer-item--active:hover {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }

  .shell__drawer-bottom {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: auto;
  }

  .shell-drawer-enter-active,
  .shell-drawer-leave-active {
    transition: opacity 0.15s ease;
  }

  .shell-drawer-enter-active .shell__drawer,
  .shell-drawer-leave-active .shell__drawer {
    transition: transform 0.15s ease;
  }

  .shell-drawer-enter-from,
  .shell-drawer-leave-to {
    opacity: 0;
  }

  .shell-drawer-enter-from .shell__drawer,
  .shell-drawer-leave-to .shell__drawer {
    transform: translateX(-100%);
  }

  @media (prefers-reduced-motion: reduce) {
    .shell__rail-btn,
    .shell-drawer-enter-active,
    .shell-drawer-leave-active,
    .shell-drawer-enter-active .shell__drawer,
    .shell-drawer-leave-active .shell__drawer {
      transition: none;
    }
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

  /* Khoảng giữa nhóm tab và nhóm icon — chứa chip lịch (canh phải, sát nhóm icon). Không overflow:
     hidden — bảng chi tiết của chip phải tràn xuống dưới header. */
  .shell__header-mid {
    display: flex;
    justify-content: flex-end;
    flex: 1 1 32px;
    min-width: 0;
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

  .shell__sep-v {
    color: var(--border);
    padding: 0 2px;
  }
</style>
