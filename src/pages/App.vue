<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NoteEditor from '@/components/notes/NoteEditor.vue'
import NoteList from '@/components/layout/NoteList.vue'
import SearchBar from '@/components/layout/SearchBar.vue'
import SettingsModal from '@/components/layout/SettingsModal.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import BookmarkTab from '@/components/bookmarks/BookmarkTab.vue'
import DictionaryTab from '@/components/dictionary/DictionaryTab.vue'
import { useColumnResize } from '@/composables/useColumnResize'
import { useAuthStore } from '@/stores/auth'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useSecureFolderStore } from '@/stores/secureFolder'
import { useSyncStore } from '@/stores/sync'
import { downloadNoteAsTxt } from '@/utils/exportNote'

const router = useRouter()
const auth = useAuthStore()
const folders = useFoldersStore()
const notes = useNotesStore()
const secure = useSecureFolderStore()
const sync = useSyncStore()
const dataReady = ref(false)
const showSettings = ref(false)
const activeTab = ref<'notes' | 'bookmarks' | 'dictionary'>('notes')
const renamingFolderId = ref<string | null>(null)
const renamingNoteId = ref<string | null>(null)

const { colW1, colW2, onResizeStart } = useColumnResize()

const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null)
const noteEditorRef = ref<InstanceType<typeof NoteEditor> | null>(null)

const loadErrorLine = computed(() => {
  const raw = (notes.loadError || folders.loadError)?.trim()
  if (!raw) return ''
  if (/failed to fetch|networkerror|network request failed/i.test(raw)) {
    return '[ERROR] Cannot connect to server'
  }
  return `[ERROR] ${raw}`
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
    if (fid && secure.isFolderLocked(fid)) return
    void notes.createNote(folders.activeFolderId)
  }
  if (e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void noteEditorRef.value?.flushSave()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown, true)
  await folders.loadAll()
  await notes.loadAll()
  dataReady.value = true
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true)
})

async function onLogout(): Promise<void> {
  secure.lockAll()
  await auth.logout()
  await router.replace({ name: 'login' })
}

const syncBusy = computed(() => sync.status === 'syncing')

const headerEmail = computed(() => auth.user?.email ?? 'OFFLINE_')

const syncBadgeText = computed(() => {
  if (sync.status === 'syncing') return 'SYNCING...'
  if (notes.isDirty) return 'UNSAVED'
  if (sync.status === 'error') return 'SYNC FAILED'
  return 'SYNCED'
})

/** Xanh khi vừa đồng bộ thành công (store = synced); mặc định khi idle. */
const syncBadgeClass = computed(() => {
  if (sync.status === 'syncing') return 'shell__sync-badge--syncing'
  if (notes.isDirty) return 'shell__sync-badge--unsaved'
  if (sync.status === 'error') return 'shell__sync-badge--error'
  if (sync.status === 'synced') return 'shell__sync-badge--done'
  return 'shell__sync-badge--idle'
})

const syncButtonStateClass = computed(() => {
  if (syncBusy.value) return ''
  if (sync.status === 'synced' && !notes.isDirty) return 'shell__sync-btn--done'
  return ''
})

async function onSync(): Promise<void> {
  try {
    await sync.runManualSync()
  } catch {
    /* lastError set in store */
  }
}

function onExport(): void {
  const n = notes.activeNote
  if (!n) return
  downloadNoteAsTxt(n, notes.bodiesForNote(n.id))
}

const syncBadgeTitle = computed(() => {
  if (sync.status === 'error' && sync.lastError) return sync.lastError
  if (sync.status === 'synced') return 'Đã đồng bộ với cloud lần gần nhất'
  if (sync.status === 'idle') return 'Chưa chạy đồng bộ trong phiên này (bấm [ SYNC ])'
  return 'Trạng thái ghi / đồng bộ'
})

const syncButtonTitle = computed(() => {
  const err = sync.lastError?.trim()
  if (sync.status === 'error' && err) return err
  if (sync.status === 'synced' && !notes.isDirty) return 'Đồng bộ lại (đã sẵn sàng)'
  return 'Đồng bộ thủ công'
})

/** Khi đang gõ SEARCH: chỉ hiện FOLDERS + NOTES, ẩn BODY để không lệch với note đang mở trước đó. */
const isSearchActive = computed(() => notes.searchQuery.trim().length > 0)

const noteListColumnStyle = computed(() =>
  isSearchActive.value
    ? { flex: '1 1 auto', minWidth: `${colW2.value}px` }
    : { width: `${colW2.value}px` },
)
</script>

<template>
  <div class="shell shell--dashboard crt-scanlines">
    <header class="shell__header">
      <div class="shell__header-row shell__header-row--top">
        <span class="shell__brand">BBQ-One</span>
        <span class="shell__sep" aria-hidden="true">───────────────────────</span>
        <div class="shell__header-right">
          <span class="shell__email" :title="headerEmail">{{ headerEmail }}</span>
          <span
            class="shell__sync-badge"
            :class="syncBadgeClass"
            role="status"
            :title="syncBadgeTitle"
          >{{ syncBadgeText }}</span>
        </div>
      </div>
      <div class="shell__header-row shell__header-row--actions">
        <div class="shell__actions">
          <!-- Tab switcher -->
          <RetroButton
            variant="sm"
            type="button"
            :class="activeTab === 'notes' ? 'shell__tab-btn--active' : ''"
            @click="activeTab = 'notes'"
          >
            [ NOTES ]
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            :class="activeTab === 'bookmarks' ? 'shell__tab-btn--active' : ''"
            @click="activeTab = 'bookmarks'"
          >
            [ BOOKMARK ]
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            :class="activeTab === 'dictionary' ? 'shell__tab-btn--active' : ''"
            @click="activeTab = 'dictionary'"
          >
            [ DICT ]
          </RetroButton>
          <span class="shell__sep-v" aria-hidden="true">|</span>
          <RetroButton
            variant="sm"
            type="button"
            class="shell__sync-btn"
            :class="syncButtonStateClass"
            :disabled="syncBusy"
            :title="syncButtonTitle"
            @click="onSync"
          >
            [ SYNC ]
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            :disabled="!notes.activeNote"
            @click="onExport"
          >
            [ EXPORT ]
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            @click="showSettings = true"
          >
            [ SETTINGS ]
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            @click="searchBarRef?.focusInput()"
          >
            [ FIND ]
          </RetroButton>
          <RetroButton type="button" @click="onLogout">
            [ LOGOUT ]
          </RetroButton>
        </div>
      </div>
      <SearchBar
      ref="searchBarRef"
      :search-mode="activeTab === 'dictionary' ? 'notes' : activeTab"
    />
    </header>

    <p
      v-if="loadErrorLine"
      class="shell__error"
      role="alert"
    >
      {{ loadErrorLine }}
    </p>

    <template v-if="dataReady">
      <!-- Tab: Notes (layout 3 cột hiện tại) -->
      <div v-show="activeTab === 'notes'" class="shell__grid">
        <Sidebar
          v-model:renaming-folder-id="renamingFolderId"
          class="shell__col shell__col--folders"
          :style="{ width: `${colW1}px` }"
        />
        <div
          class="shell__resize"
          title="Drag to resize"
          aria-hidden="true"
          @mousedown="onResizeStart(1, $event)"
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
          title="Drag to resize"
          aria-hidden="true"
          @mousedown="onResizeStart(2, $event)"
        />
        <div v-show="!isSearchActive" class="shell__col shell__col--editor">
          <NoteEditor ref="noteEditorRef" />
        </div>
      </div>

      <!-- Tab: Bookmark — chỉ mount khi user mở tab (modal PIN không phủ lên Notes). -->
      <div v-if="activeTab === 'bookmarks'" class="shell__grid shell__grid--full">
        <BookmarkTab class="shell__col--full" />
      </div>

      <!-- Tab: Dictionary — mount khi active; cache-first load trong store -->
      <div v-if="activeTab === 'dictionary'" class="shell__grid shell__grid--full">
        <DictionaryTab class="shell__col--full" />
      </div>
    </template>
    <p
      v-else
      class="shell__loading retro-empty"
    >
      LOADING<span class="retro-loading__dots"><span>.</span><span>.</span><span>.</span></span>
    </p>

    <SettingsModal v-if="showSettings" @close="showSettings = false" />
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

/* Sau login: pha xanh cobalt (accent) + highlight tìm kiếm; badge SYNCED vẫn tông vàng */
.shell--dashboard {
  --accent: var(--accent-dashboard);
  --search-hit-bg: var(--search-hit-dashboard);
  background-color: var(--bg-primary);
  background-image: radial-gradient(
    ellipse 130% 100% at 50% 0%,
    var(--bg-dashboard-radial) 0%,
    transparent 58%
  );
}

.shell__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  font-size: var(--font-size-sm);
  flex: 0 0 auto;
}

.shell--dashboard .shell__header {
  background: linear-gradient(
    180deg,
    var(--bg-dashboard-header-wash) 0%,
    transparent 72%
  );
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
}

.shell__header-row--actions {
  width: 100%;
  justify-content: flex-end;
}

/* Email + badge bên phải (đối diện BBQOne) */
.shell__header-right {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 10px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(380px, 52%);
}

.shell__brand {
  flex: 0 0 auto;
  color: var(--accent);
  letter-spacing: 0.08em;
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

.shell__email {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
  min-width: 0;
  max-width: min(260px, 100%);
}

.shell__sync-badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  padding: 2px 8px;
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--text-muted);
}

.shell__sync-badge--idle {
  color: var(--text-muted);
  border-color: var(--border);
}

.shell__sync-badge--done {
  color: var(--sync-done);
  border-color: var(--sync-done-muted);
  background: rgba(184, 115, 26, 0.12);
}

.shell__sync-badge--syncing {
  color: var(--accent);
  border-color: var(--accent);
}

.shell__sync-badge--unsaved {
  color: var(--danger);
  border-color: var(--danger);
  background: rgba(184, 69, 58, 0.06);
}

.shell__sync-badge--error {
  color: var(--danger);
  border-color: var(--danger);
}

.shell__sync-btn.shell__sync-btn--done:not(:disabled) {
  border-color: var(--sync-done-muted);
  color: var(--sync-done);
  background: rgba(184, 115, 26, 0.08);
}

.shell__sync-btn.shell__sync-btn--done:not(:disabled):hover {
  border-color: var(--sync-done);
  color: var(--text-primary);
}

.shell__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
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

.shell__col--folders,
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
  color: var(--accent) !important;
}

.shell__sep-v {
  color: var(--border);
  padding: 0 2px;
}
</style>
