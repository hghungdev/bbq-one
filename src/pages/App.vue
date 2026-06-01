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
  import LoginModal from '@/components/auth/LoginModal.vue'
  import { useColumnResize } from '@/composables/useColumnResize'
  import { useCommitPendingDeletesOnClose } from '@/composables/useCommitPendingDeletesOnClose'
  import { flushOrphanedPendingDeleteCommits } from '@/services/pendingDeleteCommit.service'
  import { useAppTimezoneStore } from '@/stores/appTimezone'
  import { useAuthStore } from '@/stores/auth'
  import { useFoldersStore } from '@/stores/folders'
  import { useNotesStore } from '@/stores/notes'
  import { useSecureFolderStore } from '@/stores/secureFolder'
  import { useSyncStore } from '@/stores/sync'
  import { useLangStore } from '@/stores/uiLang'
  import { useCalendarEventsStore } from '@/stores/calendarEvents'
  import CloudSyncStatusBadge from '@/components/sync/CloudSyncStatusBadge.vue'
  import type { CloudSyncVariant } from '@/components/sync/CloudSyncStatusBadge.vue'
  import SyncStatusBadge from '@/components/sync/SyncStatusBadge.vue'
  import IconButton from '@/components/ui/IconButton.vue'
  import ThemeModeToggle from '@/components/ui/ThemeModeToggle.vue'
  import UndoToast from '@/components/ui/UndoToast.vue'
  import DashboardSkeleton from '@/components/ui/DashboardSkeleton.vue'
  import OfflineBanner from '@/components/ui/OfflineBanner.vue'
  import { formatAppDateTime, formatUtcOffsetLabel } from '@/utils/appDateTime'
  import { todayLocalKey } from '@/utils/calendarDate'
  import {
    initAutoSyncOnNetworkRestore,
    isAutoSyncCompleteMessage,
  } from '@/services/autoSync.service'
  import { isOnline, onNetworkStatusChange } from '@/services/networkReachability.service'
  import {
    dismissOverdueReminder,
    groupOverdueIncompleteEvents,
    isOverdueReminderDismissed,
  } from '@/services/calendarOverdueReminder.service'

  useCommitPendingDeletesOnClose()

  const auth = useAuthStore()
  const { isAuthenticated } = storeToRefs(auth)
  const appTimezone = useAppTimezoneStore()
  const { utcOffsetHours } = storeToRefs(appTimezone)
  const folders = useFoldersStore()
  const notes = useNotesStore()
  const secure = useSecureFolderStore()
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

  const headerClock = ref(formatAppDateTime(new Date(), utcOffsetHours.value))
  const headerClockTooltip = computed(
    () => `${headerClock.value} (${formatUtcOffsetLabel(utcOffsetHours.value)})`,
  )
  const headerClockAria = computed(() =>
    t('app.aria.clock', {
      time: headerClock.value,
      offset: formatUtcOffsetLabel(utcOffsetHours.value),
    }),
  )
  let headerClockTimer: ReturnType<typeof setInterval> | null = null
  let stopAutoSyncListener: (() => void) | null = null
  let stopNetworkListener: (() => void) | null = null

  async function refreshStoresFromNetwork(): Promise<void> {
    if (!isOnline()) return
    await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
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

  function tickHeaderClock(): void {
    headerClock.value = formatAppDateTime(new Date(), utcOffsetHours.value)
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
      searchBarRef.value?.focusInput()
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
    tickHeaderClock()
    headerClockTimer = setInterval(tickHeaderClock, 1000)
    await langStore.loadLang()
    // Chốt xóa còn trong queue trước khi pull server — tránh “revert” sau khi đóng popup giữa undo 5s.
    await flushOrphanedPendingDeleteCommits()
    // Hiện UI ngay từ cache; refresh network chạy nền (tránh treo popup khi Supabase chậm).
    await Promise.all([
      folders.hydrateFromCache(),
      notes.hydrateFromCache(),
      calendarEvents.hydrateFromCache(),
    ])
    dataReady.value = true
    void refreshStoresFromNetwork()
    stopAutoSyncListener = initAutoSyncOnNetworkRestore()
    stopNetworkListener = onNetworkStatusChange((online) => {
      networkOnline.value = online
      if (online) void refreshStoresFromNetwork()
    })
    chrome.runtime.onMessage.addListener(onAutoSyncMessage)
    if (isAuthenticated.value) {
      void maybeShowOverdueReminder()
    }
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown, true)
    if (headerClockTimer) clearInterval(headerClockTimer)
    stopAutoSyncListener?.()
    stopNetworkListener?.()
    chrome.runtime.onMessage.removeListener(onAutoSyncMessage)
  })

  watch(utcOffsetHours, () => {
    tickHeaderClock()
  })

  /** Anonymous: chưa đăng nhập */
  const isAnonymous = computed(() => !isAuthenticated.value)

  async function onLogout(): Promise<void> {
    secure.lockAll()
    await auth.logout()
    // Sau khi logout: ở lại dashboard ở local mode, reload data từ local storage
    await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
  }

  function onGoLogin(): void {
    showLoginModal.value = true
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
          <IconButton
            class="shell__clock-btn"
            variant="default"
            type="button"
            :label="headerClockAria"
            :title="headerClockTooltip"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
              />
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 7v5l3 2"
              />
            </svg>
          </IconButton>
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
      <SearchBar
        ref="searchBarRef"
        :search-mode="
          activeTab === 'bookmarks' ? 'bookmarks' : activeTab === 'calendar' ? 'calendar' : 'notes'
        "
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

    <SettingsModal v-if="showSettings" @close="showSettings = false" />

    <!-- Login popup: hiện ngay trên dashboard thay vì navigate sang trang riêng -->
    <LoginModal v-if="showLoginModal" @close="showLoginModal = false" @success="onLoginSuccess" />

    <CalendarOverdueReminderDialog
      :visible="showOverdueReminder"
      :groups="overdueGroups"
      @close="onOverdueReminderClose"
      @confirm="onOverdueReminderConfirm"
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
    box-shadow: 0 1px 0 var(--bg-panel);
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

  .shell__clock-btn {
    cursor: default;
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
