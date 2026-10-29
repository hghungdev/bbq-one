<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import InlineSearch from '@/components/ui/InlineSearch.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import DeleteBackupModal from '@/components/bookmarks/DeleteBackupModal.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import { bookmarksService } from '@/services/bookmarks.service'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useLangStore } from '@/stores/uiLang'
import type { BookmarkGlobalHit } from '@/types/bookmark'
import { buildBookmarkBackupLabel } from '@/utils/bookmarkBackupLabel'
import { unwrapBookmarkRoot } from '@/utils/bookmarkTree'
import { countUnsafeBookmarks } from '@/utils/safeUrl'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'
import BookmarkTree from './BookmarkTree.vue'

const bm = useBookmarksStore()
const { t } = useLangStore()
const confirmRestore = ref(false)
const pendingRestoreId = ref<string | null>(null)
const confirmDeleteBackup = ref(false)
const pendingDeleteBackupId = ref<string | null>(null)
const confirmDeleteAll = ref(false)
const viewMode = ref<'live' | 'backups'>('live')

async function loadBookmarkTabData(): Promise<void> {
  await bm.loadLive()
  await bm.loadBackups()
}

// S3a: Bookmark PIN đã gỡ — mở tab là nạp dữ liệu (không còn cổng PIN).
onMounted(() => {
  void loadBookmarkTabData()
})

const treeToShow = computed(() => {
  if (viewMode.value === 'backups' && bm.selectedBackup) {
    return bm.selectedBackup.tree_json
  }
  return bm.liveTree
})

const displayTree = computed(() =>
  bookmarksService.filterBookmarkTreeByQuery(unwrapBookmarkRoot(treeToShow.value), bm.searchQuery),
)

const globalHits = computed(() =>
  bookmarksService.searchBookmarkGlobalHits(bm.searchQuery, bm.liveTree, bm.backups),
)

/** SEC-4: khôi phục bỏ link javascript: / data: — báo trước trong hộp xác nhận (cây hiện tại bị xóa rồi tạo lại). */
const pendingRestoreUnsafe = computed(() => {
  const id = pendingRestoreId.value
  const bk = id ? bm.backups.find((b) => b.id === id) : undefined
  return bk ? countUnsafeBookmarks(bk.tree_json ?? []) : 0
})

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

/** U35: "Sao lưu lần cuối" (chỉ trong phiên, sau khi bấm ☁↑) nằm trong tooltip ☁↑ thay vì một hàng riêng. */
const backupTitle = computed(() =>
  bm.lastBackupAt
    ? `${t('bookmark.backupNow')} · ${t('bookmark.lastBackup', { date: new Date(bm.lastBackupAt).toLocaleString('sv') })}`
    : t('bookmark.backupNow'),
)

/** REFRESH = đọc lại cây bookmark từ trình duyệt (chrome.bookmarks) và hiển thị LIVE — không tải lại danh sách backup từ server. */
async function onRefreshLive(): Promise<void> {
  await bm.loadLive()
  viewMode.value = 'live'
  bm.selectedBackupId = null
  bm.clearBookmarkSearch()
}
</script>

<template>
  <div class="bm-tab">
    <p v-if="bm.error" class="bm-tab__error">{{ t('common.error') }} {{ bm.error }}</p>

    <div class="bm-tab__body">
      <!-- Cột trái: danh sách backup -->
      <div class="bm-tab__backups" @click.self="bm.clearBookmarkSearch()">
        <SectionHeader :label="t('bookmark.backups')" :meta="String(bm.backups.length)">
          <!-- U33: thêm một bản sao lưu — như ＋ ở đầu mục Thư mục / Ghi chú (U15), icon màu nhấn = hành động chính. -->
          <button
            type="button"
            class="ds-icon-action ds-icon-action--accent"
            :aria-label="backupTitle"
            :title="backupTitle"
            :disabled="bm.loading"
            @click="bm.backup(backupLabel)"
          >
            <AppIcon name="upload-cloud" />
          </button>
        </SectionHeader>
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
          class="bm-tab__backup-item ds-row"
          :class="{ 'bm-tab__backup-item--active ds-row--selected': bm.selectedBackupId === bk.id }"
          @click="onBackupRowClick(bk.id)"
        >
          <div class="bm-tab__backup-top">
            <span class="bm-tab__backup-label">{{ bk.label }}</span>
            <!-- U15: ↶ / 🗑 kiểu chung — hiện khi rê chuột, đang chọn hoặc focus. -->
            <div class="bm-tab__backup-actions">
              <button
                type="button"
                class="ds-icon-action"
                :aria-label="t('bookmark.rstTitle')"
                :title="t('bookmark.rstTitle')"
                @click.stop="onRestoreClick(bk.id)"
              >
                <AppIcon name="restore" />
              </button>
              <button
                type="button"
                class="ds-icon-action ds-icon-action--danger"
                :aria-label="t('bookmark.delTitle')"
                :title="t('bookmark.delTitle')"
                @click.stop="onDeleteBackupClick(bk.id)"
              >
                <AppIcon name="trash" />
              </button>
            </div>
          </div>
          <span class="bm-tab__backup-hint">{{ bk.browser_hint }}</span>
        </div>
      </div>

      <!-- Cột phải: tree viewer -->
      <div class="bm-tab__tree-col">
        <!-- U35: ô tìm luôn hiện, ngay trên cây / KẾT QUẢ nó lọc (kiểu ô "Tìm trong tất cả ghi chú" — U11); tìm cả
             cây trình duyệt lẫn mọi bản sao lưu. ✕ của ô thay ✕ ở đầu KẾT QUẢ. Ctrl+F vẫn focus (U5). -->
        <div class="bm-tab__search">
          <InlineSearch
            persistent
            input-id="bbqone-bookmark-search"
            :query="bm.searchQuery"
            :focus-request="bm.searchFocusRequest"
            :placeholder="t('search.placeholderBookmarks')"
            :input-label="t('search.ariaBookmarks')"
            :open-label="t('search.openBookmarks')"
            :close-label="t('search.close')"
            @search="(q) => bm.setSearchQuery(q)"
            @clear="bm.clearBookmarkSearch()"
          />
        </div>
        <SectionHeader
          v-if="isBookmarkSearchActive"
          :label="t('bookmark.results')"
          :meta="String(globalHits.length)"
        />
        <SectionHeader
          v-else
          :label="viewMode === 'live' ? t('bookmark.live') : t('bookmark.backupView')"
          :meta="viewMode === 'live' ? undefined : (bm.selectedBackup?.label ?? '')"
        >
          <button
            v-if="viewMode === 'backups'"
            type="button"
            class="ds-text-action"
            @click="viewMode = 'live'; bm.selectedBackupId = null"
          >
            {{ t('bookmark.liveSwitchBtn') }}
          </button>
          <template v-else>
            <button
              type="button"
              class="ds-icon-action"
              :aria-label="t('bookmark.exportHtml')"
              :title="t('bookmark.exportHtml')"
              :disabled="bm.loading || bm.liveTree.length === 0"
              @click="bm.exportHTML()"
            >
              <AppIcon name="download" />
            </button>
            <button
              type="button"
              class="ds-icon-action"
              :aria-label="t('bookmark.refresh')"
              :title="t('bookmark.refresh')"
              :disabled="bm.loading"
              @click="onRefreshLive()"
            >
              <AppIcon name="refresh" />
            </button>
            <button
              type="button"
              class="ds-icon-action ds-icon-action--danger"
              :aria-label="t('bookmark.deleteAll')"
              :title="t('bookmark.deleteAll')"
              :disabled="bm.loading"
              @click="confirmDeleteAll = true"
            >
              <AppIcon name="trash" />
            </button>
          </template>
        </SectionHeader>
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
                  class="ds-text-action"
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
    >
      <template v-if="pendingRestoreUnsafe > 0" #default>
        <p class="bm-tab__restore-unsafe" role="note">
          <AppIcon name="alert" :size="14" />
          {{ t('bookmark.restoreUnsafe', { n: pendingRestoreUnsafe }) }}
        </p>
      </template>
    </RetroConfirm>
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
.bm-tab__restore-unsafe {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.4;
  color: var(--danger);
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
  background: var(--bg-primary);
}
/* U11: hàng phẳng (không khung) — nút chính đặc + nút chữ. */
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
  /* U35: không còn hàng thanh công cụ — hai cột bắt đầu ngay dưới header. */
  padding: 12px;
  gap: 10px;
}
.bm-tab__backups {
  width: 200px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow-y: auto;
  padding: 6px;
  background: var(--bg-panel);
}
.bm-tab__tree-col {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
}

/* U35: ô tìm dính đầu khung khi cuộn cây dài (top −6px = lấp phần đệm của khung, cây không lộ phía trên). */
.bm-tab__search {
  position: sticky;
  top: -6px;
  z-index: 2;
  margin: -6px -6px 0;
  padding: 10px 8px 6px;
  background: var(--bg-panel);
}
.bm-tab__empty {
  margin: 0;
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.bm-tab__backup-item {
  padding: 7px 8px 7px 12px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 2px;
}

.bm-tab__backup-item--active .bm-tab__backup-label {
  font-weight: 600;
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
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s linear;
}

.bm-tab__backup-item:hover .bm-tab__backup-actions,
.bm-tab__backup-item:focus-within .bm-tab__backup-actions,
.bm-tab__backup-item--active .bm-tab__backup-actions {
  opacity: 1;
}

@media (hover: none) {
  .bm-tab__backup-actions {
    opacity: 1;
  }
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
