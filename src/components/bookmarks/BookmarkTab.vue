<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import IconDeleteButton from '@/components/ui/IconDeleteButton.vue'
import IconRestoreButton from '@/components/ui/IconRestoreButton.vue'
import DeleteBackupModal from '@/components/bookmarks/DeleteBackupModal.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import { bookmarksService } from '@/services/bookmarks.service'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useBookmarkPinStore } from '@/stores/bookmarkPin'
import { useLangStore } from '@/stores/uiLang'
import type { BookmarkGlobalHit } from '@/types/bookmark'
import { buildBookmarkBackupLabel } from '@/utils/bookmarkBackupLabel'
import BookmarkSkeleton from '@/components/ui/BookmarkSkeleton.vue'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'
import BookmarkPinModal from './BookmarkPinModal.vue'
import BookmarkTree from './BookmarkTree.vue'

const bm = useBookmarksStore()
const pin = useBookmarkPinStore()
const { t } = useLangStore()
const confirmRestore = ref(false)
const pendingRestoreId = ref<string | null>(null)
const confirmDeleteBackup = ref(false)
const pendingDeleteBackupId = ref<string | null>(null)
const confirmDeleteAll = ref(false)
const viewMode = ref<'live' | 'backups'>('live')

/** Đang xác định trạng thái PIN — tránh flash modal setup trước khi load xong. */
const pinGateLoading = ref(true)
/** Chỉ hiện nội dung tab sau khi mở khóa (nếu đã đặt PIN) hoặc không cần PIN. */
const pinReady = ref(false)
const pinModalMode = ref<'setup' | 'unlock'>('unlock')

async function loadBookmarkTabData(): Promise<void> {
  await bm.loadLive()
  await bm.loadBackups()
}

async function resolvePinGate(): Promise<void> {
  // Anonymous mode: không cần PIN, vào bookmark thẳng
  if (!(await isAuthenticated())) {
    pinReady.value = true
    await loadBookmarkTabData()
    return
  }

  await pin.loadCryptoState()
  await pin.hydrateFromSession()

  // Chưa đặt PIN: vào thẳng — PIN là tùy chọn, thiết lập qua Settings
  if (!pin.hasCryptoSetup) {
    pinReady.value = true
    await loadBookmarkTabData()
    return
  }

  // Đã đặt PIN nhưng chưa unlock trong phiên này
  if (!pin.unlocked) {
    pinModalMode.value = 'unlock'
    return
  }

  pinReady.value = true
  await loadBookmarkTabData()
}

onMounted(async () => {
  pinGateLoading.value = true
  pinReady.value = false
  try {
    await resolvePinGate()
  } finally {
    pinGateLoading.value = false
  }
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

const pendingDeleteBackupLabel = computed(() => {
  const id = pendingDeleteBackupId.value
  const bk = id ? bm.backups.find((b) => b.id === id) : undefined
  return bk?.label ?? ''
})

const globalHitSections = computed(() => {
  const all = globalHits.value
  const sections: { sourceKey: string; label: string; hits: BookmarkGlobalHit[] }[] = []
  const liveHits = all.filter(h => h.sourceKey === 'live')
  if (liveHits.length > 0) {
    sections.push({ sourceKey: 'live', label: t('bookmark.live'), hits: liveHits })
  }
  for (const bk of bm.backups) {
    const hits = all.filter(h => h.sourceKey === bk.id)
    if (hits.length > 0) {
      sections.push({ sourceKey: bk.id, label: `${t('bookmark.backups')} · ${bk.label}`, hits })
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

function onDeleteBackupClick(id: string): void {
  bm.clearBookmarkSearch()
  pendingDeleteBackupId.value = id
  confirmDeleteBackup.value = true
}

function onDeleteBackupModalClose(): void {
  confirmDeleteBackup.value = false
  pendingDeleteBackupId.value = null
}

async function onDeleteBackupConfirm(): Promise<void> {
  const id = pendingDeleteBackupId.value
  confirmDeleteBackup.value = false
  pendingDeleteBackupId.value = null
  if (!id) return
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

const backupLabel = computed(() => buildBookmarkBackupLabel('manual'))

/** REFRESH = đọc lại cây bookmark từ trình duyệt (chrome.bookmarks) và hiển thị LIVE — không tải lại danh sách backup từ server. */
async function onRefreshLive(): Promise<void> {
  await bm.loadLive()
  viewMode.value = 'live'
  bm.selectedBackupId = null
  bm.clearBookmarkSearch()
}
</script>

<template>
  <BookmarkSkeleton v-if="pinGateLoading" class="bm-tab__skeleton" />
  <BookmarkPinModal
    v-else-if="!pinReady"
    :mode="pinModalMode"
    @done="onPinDone"
  />
  <div v-else class="bm-tab">
    <!-- Toolbar -->
    <div class="bm-tab__toolbar" @click.self="bm.clearBookmarkSearch()">
      <RetroButton variant="sm" :disabled="bm.loading" @click="bm.backup(backupLabel)">
        {{ t('bookmark.backupNow') }}
      </RetroButton>
      <RetroButton variant="sm" :disabled="bm.loading || bm.liveTree.length === 0" @click="bm.exportHTML()">
        {{ t('bookmark.exportHtml') }}
      </RetroButton>
      <RetroButton variant="sm" :disabled="bm.loading" @click="onRefreshLive()">
        {{ t('bookmark.refresh') }}
      </RetroButton>
      <RetroButton
        variant="sm"
        :disabled="bm.loading"
        class="bm-tab__btn--danger"
        @click="confirmDeleteAll = true"
      >
        {{ t('bookmark.deleteAll') }}
      </RetroButton>
      <span v-if="bm.lastBackupAt" class="bm-tab__hint">
        {{ t('bookmark.lastBackup', { date: new Date(bm.lastBackupAt).toLocaleString('sv') }) }}
      </span>
    </div>

    <p v-if="bm.error" class="bm-tab__error">{{ t('common.error') }} {{ bm.error }}</p>

    <div class="bm-tab__body">
      <!-- Cột trái: danh sách backup -->
      <div class="bm-tab__backups" @click.self="bm.clearBookmarkSearch()">
        <p class="bm-tab__col-title">{{ t('bookmark.backups') }}</p>
        <div
          v-if="bm.loading && bm.backups.length === 0"
          class="bm-tab__backups-skel"
          role="status"
          :aria-label="t('bookmark.loading')"
        >
          <div v-for="i in 3" :key="i" class="bm-tab__backup-skel-item">
            <SkeletonLoader variant="line" width="100%" height="12" rounded="6px" />
            <SkeletonLoader variant="line" width="60%" height="10" rounded="6px" />
          </div>
        </div>
        <p
          v-else-if="bm.backups.length === 0"
          class="bm-tab__empty"
        >{{ t('bookmark.noneYet') }}</p>
        <div
          v-for="bk in bm.backups"
          :key="bk.id"
          class="bm-tab__backup-item"
          :class="{ 'bm-tab__backup-item--active': bm.selectedBackupId === bk.id }"
          @click="onBackupRowClick(bk.id)"
        >
          <div class="bm-tab__backup-top">
            <span class="bm-tab__backup-label">{{ bk.label }}</span>
            <div class="bm-tab__backup-actions">
              <IconRestoreButton
                :title="t('bookmark.rstTitle')"
                @click.stop="onRestoreClick(bk.id)"
              />
              <IconDeleteButton
                :title="t('bookmark.delTitle')"
                @click.stop="onDeleteBackupClick(bk.id)"
              />
            </div>
          </div>
          <span class="bm-tab__backup-hint">{{ bk.browser_hint }}</span>
        </div>
      </div>

      <!-- Cột phải: tree viewer -->
      <div class="bm-tab__tree-col">
        <p v-if="isBookmarkSearchActive" class="bm-tab__col-title">
          {{ t('bookmark.globalSearch', { n: globalHits.length }) }}
          <button
            type="button"
            class="bm-tab__act-btn bm-tab__title-action"
            :title="t('bookmark.clearTitle')"
            @click="bm.clearBookmarkSearch()"
          >
            {{ t('bookmark.clearSearch') }}
          </button>
        </p>
        <p v-else class="bm-tab__col-title">
          {{ viewMode === 'live' ? t('bookmark.live') : t('bookmark.backupTitle', { label: bm.selectedBackup?.label ?? '' }) }}
          <button
            v-if="viewMode === 'backups'"
            class="bm-tab__act-btn bm-tab__title-action"
            @click="viewMode = 'live'; bm.selectedBackupId = null"
          >
            {{ t('bookmark.liveSwitchBtn') }}
          </button>
        </p>
        <div
          v-if="bm.loading"
          class="bm-tab__tree-skel"
          role="status"
          :aria-label="t('bookmark.loading')"
        >
          <div
            v-for="row in 8"
            :key="row"
            class="bm-tab__tree-skel-row"
            :class="[`bm-tab__tree-skel-row--depth-${row % 3}`]"
          >
            <SkeletonLoader variant="circle" width="14" height="14" />
            <SkeletonLoader
              variant="line"
              :width="`${72 - (row % 4) * 8}%`"
              height="12"
              rounded="6px"
            />
          </div>
        </div>
        <!-- Có ô SEARCH: quét LIVE + mọi backup -->
        <div v-else-if="isBookmarkSearchActive" class="bm-tab__global">
          <p v-if="globalHits.length === 0" class="bm-tab__empty">{{ t('bookmark.noMatchesAny') }}</p>
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
                  :title="t('bookmark.treeTitle')"
                  @click="focusSourceInTree(sec.sourceKey)"
                >
                  {{ t('bookmark.tree') }}
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
        <p v-else class="bm-tab__empty">{{ t('bookmark.noBookmarks') }}</p>
      </div>
    </div>

    <RetroConfirm
      v-model:open="confirmRestore"
      :message="t('bookmark.confirmRestore')"
      @confirm="onRestoreConfirm"
    />
    <DeleteBackupModal
      :open="confirmDeleteBackup"
      :backup-label="pendingDeleteBackupLabel"
      @close="onDeleteBackupModalClose"
      @confirm="onDeleteBackupConfirm"
    />
    <RetroConfirm
      v-model:open="confirmDeleteAll"
      :message="t('bookmark.confirmDeleteAll')"
      @confirm="onDeleteAllConfirm"
    />
  </div>
</template>

<style scoped>
.bm-tab__skeleton {
  flex: 1 1 auto;
  min-height: 0;
}

.bm-tab__tree-skel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 4px 8px;
}

.bm-tab__tree-skel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
}

.bm-tab__tree-skel-row--depth-0 {
  padding-left: 4px;
}

.bm-tab__tree-skel-row--depth-1 {
  padding-left: 22px;
}

.bm-tab__tree-skel-row--depth-2 {
  padding-left: 40px;
}

.bm-tab__backups-skel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 2px;
}

.bm-tab__backup-skel-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel) 40%, transparent);
}

.bm-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--accent) 4%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-primary);
}
.bm-tab__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 10px 12px 8px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
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
  padding: 0 12px 12px;
  gap: 10px;
}
.bm-tab__backups {
  width: 200px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow-y: auto;
  padding: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
}
.bm-tab__tree-col {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 8px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
}
.bm-tab__col-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  padding: 7px 10px;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 74%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
  letter-spacing: -0.012em;
}
.bm-tab__empty {
  margin: 0;
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.bm-tab__backup-item {
  padding: 8px 10px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 6px;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}
.bm-tab__backup-item:hover,
.bm-tab__backup-item--active {
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
}

.bm-tab__backup-item--active .bm-tab__backup-label {
  color: var(--accent);
}

.bm-tab__backup-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bm-tab__backup-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--font-size-sm);
  line-height: 1.35;
  color: var(--text-primary);
  word-break: break-word;
}
.bm-tab__backup-hint {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: -0.012em;
}
.bm-tab__backup-actions {
  display: flex;
  flex: 0 0 auto;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}
.bm-tab__act-btn {
  background: color-mix(in srgb, var(--bg-panel) 74%, var(--bg-secondary));
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--accent);
  font-size: var(--font-size-sm);
  padding: 3px 9px;
  cursor: pointer;
  font-family: inherit;
}
.bm-tab__act-btn:hover { border-color: var(--accent); }

.bm-tab__title-action {
  margin-left: auto;
}

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
  margin-bottom: 10px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 60%, transparent);
}

.bm-tab__global-sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 0 8px;
  margin-bottom: 6px;
}

.bm-tab__global-sec-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: -0.012em;
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
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.bm-tab__global-row:hover {
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
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
