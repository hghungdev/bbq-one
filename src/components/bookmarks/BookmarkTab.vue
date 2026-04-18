<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import { bookmarksService } from '@/services/bookmarks.service'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useBookmarkPinStore } from '@/stores/bookmarkPin'
import type { BookmarkGlobalHit } from '@/types/bookmark'
import BookmarkPinModal from './BookmarkPinModal.vue'
import BookmarkTree from './BookmarkTree.vue'

const bm = useBookmarksStore()
const pin = useBookmarkPinStore()
const confirmRestore = ref(false)
const pendingRestoreId = ref<string | null>(null)
const confirmDeleteAll = ref(false)
const viewMode = ref<'live' | 'backups'>('live')

/** Chỉ hiện nội dung tab sau khi đặt PIN (lần đầu) hoặc mở khóa. */
const pinReady = ref(false)
const pinModalMode = ref<'setup' | 'unlock'>('setup')

async function loadBookmarkTabData(): Promise<void> {
  await bm.loadLive()
  await bm.loadBackups()
}

onMounted(async () => {
  await pin.loadCryptoState()
  await pin.hydrateFromSession()
  if (!pin.hasCryptoSetup) {
    pinModalMode.value = 'setup'
    return
  }
  if (!pin.unlocked) {
    pinModalMode.value = 'unlock'
    return
  }
  pinReady.value = true
  await loadBookmarkTabData()
})

function onPinDone(): void {
  pinReady.value = true
  void loadBookmarkTabData()
}

const treeToShow = computed(() => {
  if (viewMode.value === 'backups' && bm.selectedBackup) {
    return bm.selectedBackup.tree_json
  }
  return bm.liveTree
})

const displayTree = computed(() =>
  bookmarksService.filterBookmarkTreeByQuery(treeToShow.value, bm.searchQuery),
)

const globalHits = computed(() =>
  bookmarksService.searchBookmarkGlobalHits(bm.searchQuery, bm.liveTree, bm.backups),
)

const globalHitSections = computed(() => {
  const all = globalHits.value
  const sections: { sourceKey: string; label: string; hits: BookmarkGlobalHit[] }[] = []
  const liveHits = all.filter(h => h.sourceKey === 'live')
  if (liveHits.length > 0) {
    sections.push({ sourceKey: 'live', label: 'LIVE BROWSER', hits: liveHits })
  }
  for (const bk of bm.backups) {
    const hits = all.filter(h => h.sourceKey === bk.id)
    if (hits.length > 0) {
      sections.push({ sourceKey: bk.id, label: `BACKUP · ${bk.label}`, hits })
    }
  }
  return sections
})

const isBookmarkSearchActive = computed(() => bm.searchQuery.trim().length > 0)

function focusSourceInTree(sourceKey: string): void {
  if (sourceKey === 'live') {
    viewMode.value = 'live'
    bm.selectedBackupId = null
  } else {
    bm.selectedBackupId = sourceKey
    viewMode.value = 'backups'
  }
  bm.clearBookmarkSearch()
}

/** Chọn backup ở cột trái: thoát GLOBAL SEARCH để xem cây backup (session search không còn chặn UI). */
function onBackupRowClick(id: string): void {
  bm.selectedBackupId = id
  viewMode.value = 'backups'
  bm.clearBookmarkSearch()
}

function onRestoreClick(id: string): void {
  bm.clearBookmarkSearch()
  pendingRestoreId.value = id
  confirmRestore.value = true
}

async function onDeleteBackupClick(id: string): Promise<void> {
  bm.clearBookmarkSearch()
  await bm.deleteBackup(id)
}

async function onRestoreConfirm(): Promise<void> {
  if (!pendingRestoreId.value) return
  await bm.restore(pendingRestoreId.value)
  confirmRestore.value = false
  viewMode.value = 'live'
}

async function onDeleteAllConfirm(): Promise<void> {
  await bm.deleteAllFromBrowser()
  confirmDeleteAll.value = false
}

const backupLabel = computed(() => {
  const d = new Date()
  return `${d.toLocaleDateString('sv')} ${d.toLocaleTimeString('sv', { hour: '2-digit', minute: '2-digit' })}`
})

/** REFRESH = đọc lại cây bookmark từ trình duyệt (chrome.bookmarks) và hiển thị LIVE — không tải lại danh sách backup từ server. */
async function onRefreshLive(): Promise<void> {
  await bm.loadLive()
  viewMode.value = 'live'
  bm.selectedBackupId = null
  bm.clearBookmarkSearch()
}
</script>

<template>
  <BookmarkPinModal v-if="!pinReady" :mode="pinModalMode" @done="onPinDone" />
  <div v-else class="bm-tab">
    <!-- Toolbar -->
    <div class="bm-tab__toolbar" @click.self="bm.clearBookmarkSearch()">
      <RetroButton variant="sm" :disabled="bm.loading" @click="bm.backup(backupLabel)">
        [ BACKUP NOW ]
      </RetroButton>
      <RetroButton variant="sm" :disabled="bm.loading || bm.liveTree.length === 0" @click="bm.exportHTML()">
        [ EXPORT HTML ]
      </RetroButton>
      <RetroButton variant="sm" :disabled="bm.loading" @click="onRefreshLive()">
        [ REFRESH ]
      </RetroButton>
      <RetroButton
        variant="sm"
        :disabled="bm.loading"
        class="bm-tab__btn--danger"
        @click="confirmDeleteAll = true"
      >
        [ DELETE ALL ]
      </RetroButton>
      <span v-if="bm.lastBackupAt" class="bm-tab__hint">
        Last backup: {{ new Date(bm.lastBackupAt).toLocaleString('sv') }}
      </span>
    </div>

    <p v-if="bm.error" class="bm-tab__error">&gt; [ERROR] {{ bm.error }}</p>

    <div class="bm-tab__body">
      <!-- Cột trái: danh sách backup -->
      <div class="bm-tab__backups" @click.self="bm.clearBookmarkSearch()">
        <p class="bm-tab__col-title">BACKUPS</p>
        <p v-if="bm.backups.length === 0" class="bm-tab__empty">&gt; none yet_</p>
        <div
          v-for="bk in bm.backups"
          :key="bk.id"
          class="bm-tab__backup-item"
          :class="{ 'bm-tab__backup-item--active': bm.selectedBackupId === bk.id }"
          @click="onBackupRowClick(bk.id)"
        >
          <span class="bm-tab__backup-label">{{ bk.label }}</span>
          <span class="bm-tab__backup-hint">{{ bk.browser_hint }}</span>
          <div class="bm-tab__backup-actions">
            <button class="bm-tab__act-btn" title="Restore" @click.stop="onRestoreClick(bk.id)">[RST]</button>
            <button class="bm-tab__act-btn bm-tab__act-btn--del" title="Delete" @click.stop="onDeleteBackupClick(bk.id)">[DEL]</button>
          </div>
        </div>
      </div>

      <!-- Cột phải: tree viewer -->
      <div class="bm-tab__tree-col">
        <p v-if="isBookmarkSearchActive" class="bm-tab__col-title">
          GLOBAL SEARCH · {{ globalHits.length }} hit(s)
          <button
            type="button"
            class="bm-tab__act-btn"
            style="margin-left:8px"
            title="Clear search"
            @click="bm.clearBookmarkSearch()"
          >
            [ CLEAR ]
          </button>
        </p>
        <p v-else class="bm-tab__col-title">
          {{ viewMode === 'live' ? 'LIVE BROWSER' : `BACKUP: ${bm.selectedBackup?.label ?? ''}` }}
          <button
            v-if="viewMode === 'backups'"
            class="bm-tab__act-btn"
            style="margin-left:8px"
            @click="viewMode = 'live'; bm.selectedBackupId = null"
          >
            [LIVE]
          </button>
        </p>
        <p v-if="bm.loading" class="bm-tab__empty">&gt; LOADING...</p>
        <!-- Có ô SEARCH: quét LIVE + mọi backup -->
        <div v-else-if="isBookmarkSearchActive" class="bm-tab__global">
          <p v-if="globalHits.length === 0" class="bm-tab__empty">&gt; NO MATCHES in any snapshot_</p>
          <div v-else class="bm-tab__global-scroll">
            <section
              v-for="sec in globalHitSections"
              :key="sec.sourceKey"
              class="bm-tab__global-sec"
            >
              <div class="bm-tab__global-sec-head">
                <span class="bm-tab__global-sec-title">{{ sec.label }}</span>
                <button
                  type="button"
                  class="bm-tab__act-btn"
                  title="Open this source in tree view"
                  @click="focusSourceInTree(sec.sourceKey)"
                >
                  [ TREE ]
                </button>
              </div>
              <ul class="bm-tab__global-list">
                <li
                  v-for="h in sec.hits"
                  :key="`${sec.sourceKey}-${h.id}-${h.url}`"
                  class="bm-tab__global-row"
                >
                  <a
                    :href="h.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="bm-tab__global-link"
                  >{{ h.title }}</a>
                  <span class="bm-tab__global-path">{{ h.path }}</span>
                </li>
              </ul>
            </section>
          </div>
        </div>
        <BookmarkTree v-else-if="displayTree.length" :nodes="displayTree" />
        <p v-else class="bm-tab__empty">&gt; NO BOOKMARKS_</p>
      </div>
    </div>

    <RetroConfirm
      v-model:open="confirmRestore"
      message="Restore sẽ GHI ĐÈ toàn bộ bookmark hiện tại. Tiếp tục?"
      @confirm="onRestoreConfirm"
    />
    <RetroConfirm
      v-model:open="confirmDeleteAll"
      message="Xóa toàn bộ bookmark trên trình duyệt (thanh yêu thích, khác…)? Không thể hoàn tác."
      @confirm="onDeleteAllConfirm"
    />
  </div>
</template>

<style scoped>
.bm-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}
.bm-tab__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.bm-tab__hint {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.bm-tab__error {
  margin: 0;
  padding: 6px 12px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border-bottom: 1px solid var(--border);
}
.bm-tab__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.bm-tab__backups {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 8px 0;
}
.bm-tab__tree-col {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 8px 12px;
  min-width: 0;
}
.bm-tab__col-title {
  margin: 0 0 6px;
  padding: 0 12px 6px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  letter-spacing: 0.08em;
}
.bm-tab__empty {
  margin: 0;
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.bm-tab__backup-item {
  padding: 6px 12px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bm-tab__backup-item:hover,
.bm-tab__backup-item--active {
  background: var(--bg-panel);
  color: var(--accent);
}
.bm-tab__backup-label {
  font-size: var(--font-size-sm);
  word-break: break-all;
}
.bm-tab__backup-hint {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.bm-tab__backup-actions {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}
.bm-tab__act-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--accent);
  font-size: 10px;
  padding: 1px 4px;
  cursor: pointer;
  font-family: var(--font-mono, monospace);
}
.bm-tab__act-btn:hover { border-color: var(--accent); }
.bm-tab__act-btn--del { color: var(--danger); }
.bm-tab__act-btn--del:hover { border-color: var(--danger); }

.bm-tab__btn--danger {
  border-color: var(--danger) !important;
  color: var(--danger) !important;
}

.bm-tab__global {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bm-tab__global-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 8px;
}

.bm-tab__global-sec {
  margin-bottom: 14px;
}

.bm-tab__global-sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0 6px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
}

.bm-tab__global-sec-title {
  font-size: var(--font-size-sm);
  color: var(--accent);
  letter-spacing: 0.06em;
}

.bm-tab__global-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.bm-tab__global-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border);
  font-size: var(--font-size-sm);
}

.bm-tab__global-link {
  color: var(--text-secondary);
  text-decoration: none;
  word-break: break-word;
}

.bm-tab__global-link:hover {
  color: var(--accent);
  text-decoration: underline;
}

.bm-tab__global-path {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.35;
  word-break: break-word;
}
</style>
