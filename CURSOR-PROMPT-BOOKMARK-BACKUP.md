# CURSOR PROMPT — Tích hợp Bookmark Backup vào BBQNote Extension

> **Mục tiêu**: Thêm tab "BOOKMARK" vào BBQNote extension hiện có.  
> Cho phép user đọc bookmark từ Chrome API, hiển thị dạng tree, backup lên Supabase (bảng riêng),  
> và restore lại trình duyệt bất cứ lúc nào. Data đồng bộ theo `user_id` — đăng nhập trên máy/trình duyệt nào cũng lấy được.

---

## 0. Phân tích source hiện tại (đã đọc)

```
src/
├── pages/App.vue              ← Shell chính, header + 3 cột layout
├── router/index.ts            ← Hash-based router (/ và /login)
├── types/index.ts             ← interface Note, Folder, SyncStatus
├── services/supabase.ts       ← createClient với chromeStorageAdapter
├── services/sync.service.ts   ← syncDirtyNotesFromList, syncFromCache
├── stores/folders.ts          ← Pinia store, dùng chrome.storage.local cache
├── constants/storage.ts       ← NOTES_CACHE_KEY, FOLDERS_CACHE_KEY
├── components/ui/             ← RetroButton, RetroInput, RetroConfirm
└── assets/styles/retro.css    ← Design system biến CSS (--bg-primary, --accent, v.v.)
```

**Điểm quan trọng khi tích hợp:**
- Manifest đã có `"bookmarks"` permission → **cần thêm vào `public/manifest.json`**
- Supabase client đã sẵn, auth theo `user_id` → chỉ cần tạo bảng mới
- Pattern đang dùng: service → store (Pinia) → component, theo đúng pattern này
- UI style: retro terminal, dùng `RetroButton` + CSS variables của project

---

## 1. Thay đổi cần làm — Danh sách file

```
THÊM MỚI:
src/types/bookmark.ts                        ← Type definitions
src/services/bookmarks.service.ts            ← Chrome API + Supabase CRUD
src/stores/bookmarks.ts                      ← Pinia store
src/composables/useBookmarkTree.ts           ← Build/flatten tree
src/components/bookmarks/BookmarkTab.vue     ← Tab container chính
src/components/bookmarks/BookmarkTree.vue    ← Render tree đệ quy
src/components/bookmarks/BookmarkToolbar.vue ← Nút Backup/Restore/Export
supabase/005_bookmarks.sql                   ← Migration SQL

CHỈNH SỬA:
public/manifest.json          ← Thêm "bookmarks" permission
src/pages/App.vue             ← Thêm tab switcher NOTES | BOOKMARK
src/constants/storage.ts      ← Thêm BOOKMARKS_CACHE_KEY
```

---

## 2. SQL Migration — Supabase

Tạo file `supabase/005_bookmarks.sql` với nội dung sau:

```sql
-- BBQNote: Bookmark Backup
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bookmark_backups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT '',          -- tên snapshot, VD: "2026-04-17 auto"
  tree_json    JSONB NOT NULL,                    -- toàn bộ chrome.bookmarks.getTree()
  browser_hint TEXT DEFAULT '',                   -- "chrome" | "edge" | "brave" v.v.
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Mỗi user chỉ giữ tối đa 20 backup (xóa cũ khi insert mới — trigger)
CREATE OR REPLACE FUNCTION public.bbq_trim_bookmark_backups()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM bookmark_backups
  WHERE id IN (
    SELECT id FROM bookmark_backups
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    OFFSET 20
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trim_bookmark_backups ON bookmark_backups;
CREATE TRIGGER trim_bookmark_backups
  AFTER INSERT ON bookmark_backups
  FOR EACH ROW EXECUTE FUNCTION public.bbq_trim_bookmark_backups();

-- RLS
ALTER TABLE bookmark_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON bookmark_backups
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## 3. Type Definitions

Tạo `src/types/bookmark.ts`:

```typescript
/** Node trả về từ chrome.bookmarks.getTree() */
export interface BookmarkNode {
  id: string
  parentId?: string
  index?: number
  url?: string          // undefined nếu là folder
  title: string
  dateAdded?: number
  dateGroupModified?: number
  children?: BookmarkNode[]
}

/** 1 snapshot backup lưu trên Supabase */
export interface BookmarkBackup {
  id: string
  user_id: string
  label: string
  tree_json: BookmarkNode[]
  browser_hint: string
  created_at: string
}

/** Node đã flatten để render danh sách phẳng (tùy chọn dùng trong search) */
export interface FlatBookmark {
  id: string
  title: string
  url: string
  path: string          // "Bookmarks Bar > Dev > Tools"
  depth: number
}
```

---

## 4. Service

Tạo `src/services/bookmarks.service.ts`:

```typescript
import { supabase } from './supabase'
import type { BookmarkBackup, BookmarkNode } from '@/types/bookmark'

export const bookmarksService = {
  /** Đọc toàn bộ bookmark từ Chrome API */
  async getFromBrowser(): Promise<BookmarkNode[]> {
    return chrome.bookmarks.getTree() as unknown as BookmarkNode[]
  },

  /** Lấy danh sách backup từ Supabase (20 gần nhất) */
  async listBackups(): Promise<BookmarkBackup[]> {
    const { data, error } = await supabase
      .from('bookmark_backups')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    return data as BookmarkBackup[]
  },

  /** Lưu snapshot mới lên Supabase */
  async saveBackup(tree: BookmarkNode[], label?: string): Promise<BookmarkBackup> {
    const browserHint = navigator.userAgent.includes('Edg') ? 'edge'
      : navigator.userAgent.includes('Chrome') ? 'chrome' : 'other'
    
    const { data, error } = await supabase
      .from('bookmark_backups')
      .insert({
        label: label ?? new Date().toLocaleString('sv'), // "2026-04-17 14:30:00"
        tree_json: tree,
        browser_hint: browserHint,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data as BookmarkBackup
  },

  /** Xóa 1 backup */
  async deleteBackup(id: string): Promise<void> {
    const { error } = await supabase
      .from('bookmark_backups')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  /** Restore: ghi lại toàn bộ bookmark tree vào Chrome
   *  Chiến lược: xóa hết children của "Bookmarks bar" và "Other bookmarks", rồi import lại
   */
  async restoreToChrome(tree: BookmarkNode[]): Promise<void> {
    // tree[0] = root "0", tree[0].children = [Bookmarks bar "1", Other "2", Mobile "3"]
    const root = tree[0]
    if (!root?.children) return

    for (const topFolder of root.children) {
      // Lấy children hiện tại của folder này trong Chrome
      const existing = await chrome.bookmarks.getChildren(topFolder.id).catch(() => [])
      for (const child of existing) {
        await chrome.bookmarks.removeTree(child.id).catch(() => {})
      }
      // Import lại từ backup
      if (topFolder.children) {
        await importChildren(topFolder.id, topFolder.children)
      }
    }
  },

  /** Export ra file HTML (Netscape Bookmark Format) — compatible mọi browser */
  exportAsHTML(tree: BookmarkNode[]): void {
    const lines: string[] = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<!-- This is an automatically generated file. -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>Bookmarks</TITLE>',
      '<H1>Bookmarks</H1>',
      '<DL><p>',
    ]
    function walk(nodes: BookmarkNode[], indent = 1): void {
      const pad = '    '.repeat(indent)
      for (const n of nodes) {
        if (n.url) {
          lines.push(`${pad}<DT><A HREF="${n.url}">${escHtml(n.title)}</A>`)
        } else {
          lines.push(`${pad}<DT><H3>${escHtml(n.title)}</H3>`)
          lines.push(`${pad}<DL><p>`)
          if (n.children) walk(n.children, indent + 1)
          lines.push(`${pad}</DL><p>`)
        }
      }
    }
    const root = tree[0]
    if (root?.children) walk(root.children)
    lines.push('</DL><p>')
    const blob = new Blob([lines.join('\n')], { type: 'text/html' })
    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename: `bookmarks-${Date.now()}.html`,
    })
  },
}

// Helper: đệ quy import children
async function importChildren(parentId: string, nodes: BookmarkNode[]): Promise<void> {
  for (const node of nodes) {
    if (node.url) {
      await chrome.bookmarks.create({ parentId, title: node.title, url: node.url })
    } else {
      const created = await chrome.bookmarks.create({ parentId, title: node.title })
      if (node.children) await importChildren(created.id, node.children)
    }
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

---

## 5. Pinia Store

Tạo `src/stores/bookmarks.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { bookmarksService } from '@/services/bookmarks.service'
import type { BookmarkBackup, BookmarkNode } from '@/types/bookmark'

export const useBookmarksStore = defineStore('bookmarks', () => {
  const liveTree = ref<BookmarkNode[]>([])
  const backups = ref<BookmarkBackup[]>([])
  const selectedBackupId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastBackupAt = ref<string | null>(null)

  const selectedBackup = computed(
    () => backups.value.find(b => b.id === selectedBackupId.value) ?? null
  )

  /** Load bookmark từ Chrome (live) */
  async function loadLive(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      liveTree.value = await bookmarksService.getFromBrowser()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  /** Load danh sách backup từ Supabase */
  async function loadBackups(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      backups.value = await bookmarksService.listBackups()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  /** Backup live tree lên Supabase */
  async function backup(label?: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const tree = await bookmarksService.getFromBrowser()
      const saved = await bookmarksService.saveBackup(tree, label)
      backups.value.unshift(saved)
      lastBackupAt.value = saved.created_at
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  /** Restore backup được chọn vào Chrome */
  async function restore(backupId: string): Promise<void> {
    const bk = backups.value.find(b => b.id === backupId)
    if (!bk) return
    loading.value = true
    error.value = null
    try {
      await bookmarksService.restoreToChrome(bk.tree_json)
      await loadLive()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function deleteBackup(id: string): Promise<void> {
    await bookmarksService.deleteBackup(id)
    backups.value = backups.value.filter(b => b.id !== id)
    if (selectedBackupId.value === id) selectedBackupId.value = null
  }

  function exportHTML(): void {
    bookmarksService.exportAsHTML(liveTree.value)
  }

  return {
    liveTree, backups, selectedBackupId, selectedBackup,
    loading, error, lastBackupAt,
    loadLive, loadBackups, backup, restore, deleteBackup, exportHTML,
  }
})
```

---

## 6. Component BookmarkTab.vue

Tạo `src/components/bookmarks/BookmarkTab.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import { useBookmarksStore } from '@/stores/bookmarks'
import BookmarkTree from './BookmarkTree.vue'

const bm = useBookmarksStore()
const confirmRestore = ref(false)
const pendingRestoreId = ref<string | null>(null)
const viewMode = ref<'live' | 'backups'>('live')

onMounted(async () => {
  await bm.loadLive()
  await bm.loadBackups()
})

const treeToShow = computed(() => {
  if (viewMode.value === 'backups' && bm.selectedBackup) {
    return bm.selectedBackup.tree_json
  }
  return bm.liveTree
})

function onRestoreClick(id: string) {
  pendingRestoreId.value = id
  confirmRestore.value = true
}

async function onRestoreConfirm() {
  if (!pendingRestoreId.value) return
  await bm.restore(pendingRestoreId.value)
  confirmRestore.value = false
  viewMode.value = 'live'
}

const backupLabel = computed(() => {
  const d = new Date()
  return `${d.toLocaleDateString('sv')} ${d.toLocaleTimeString('sv', { hour: '2-digit', minute: '2-digit' })}`
})
</script>

<template>
  <div class="bm-tab">
    <!-- Toolbar -->
    <div class="bm-tab__toolbar">
      <RetroButton variant="sm" :disabled="bm.loading" @click="bm.backup(backupLabel)">
        [ BACKUP NOW ]
      </RetroButton>
      <RetroButton variant="sm" :disabled="bm.loading || bm.liveTree.length === 0" @click="bm.exportHTML()">
        [ EXPORT HTML ]
      </RetroButton>
      <RetroButton variant="sm" :disabled="bm.loading" @click="bm.loadLive()">
        [ REFRESH ]
      </RetroButton>
      <span v-if="bm.lastBackupAt" class="bm-tab__hint">
        Last backup: {{ new Date(bm.lastBackupAt).toLocaleString('sv') }}
      </span>
    </div>

    <p v-if="bm.error" class="bm-tab__error">> [ERROR] {{ bm.error }}</p>

    <div class="bm-tab__body">
      <!-- Cột trái: danh sách backup -->
      <div class="bm-tab__backups">
        <p class="bm-tab__col-title">BACKUPS</p>
        <p v-if="bm.backups.length === 0" class="bm-tab__empty">> none yet_</p>
        <div
          v-for="bk in bm.backups"
          :key="bk.id"
          class="bm-tab__backup-item"
          :class="{ 'bm-tab__backup-item--active': bm.selectedBackupId === bk.id }"
          @click="bm.selectedBackupId = bk.id; viewMode = 'backups'"
        >
          <span class="bm-tab__backup-label">{{ bk.label }}</span>
          <span class="bm-tab__backup-hint">{{ bk.browser_hint }}</span>
          <div class="bm-tab__backup-actions">
            <button class="bm-tab__act-btn" title="Restore" @click.stop="onRestoreClick(bk.id)">[RST]</button>
            <button class="bm-tab__act-btn bm-tab__act-btn--del" title="Delete" @click.stop="bm.deleteBackup(bk.id)">[DEL]</button>
          </div>
        </div>
      </div>

      <!-- Cột phải: tree viewer -->
      <div class="bm-tab__tree-col">
        <p class="bm-tab__col-title">
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
        <p v-if="bm.loading" class="bm-tab__empty">> LOADING...</p>
        <BookmarkTree v-else-if="treeToShow.length" :nodes="treeToShow" />
        <p v-else class="bm-tab__empty">> NO BOOKMARKS_</p>
      </div>
    </div>

    <RetroConfirm
      v-if="confirmRestore"
      message="Restore sẽ GHI ĐÈ toàn bộ bookmark hiện tại. Tiếp tục?"
      @confirm="onRestoreConfirm"
      @cancel="confirmRestore = false"
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
</style>
```

---

## 7. Component BookmarkTree.vue (đệ quy)

Tạo `src/components/bookmarks/BookmarkTree.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { BookmarkNode } from '@/types/bookmark'

const props = defineProps<{ nodes: BookmarkNode[]; depth?: number }>()
const depth = props.depth ?? 0
const collapsed = ref<Set<string>>(new Set())

function toggle(id: string) {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
}
</script>

<template>
  <ul class="bm-tree" :class="depth > 0 ? 'bm-tree--child' : ''">
    <li v-for="node in nodes" :key="node.id" class="bm-tree__item">
      <!-- Folder -->
      <div v-if="!node.url" class="bm-tree__row bm-tree__row--folder" @click="toggle(node.id)">
        <span class="bm-tree__icon">{{ collapsed.has(node.id) ? '▶' : '▼' }}</span>
        <span class="bm-tree__title">{{ node.title || '(no name)' }}</span>
        <span v-if="node.children" class="bm-tree__count">{{ node.children.length }}</span>
      </div>
      <!-- Bookmark link -->
      <div v-else class="bm-tree__row bm-tree__row--link">
        <span class="bm-tree__icon bm-tree__icon--link">›</span>
        <a :href="node.url" target="_blank" class="bm-tree__link" :title="node.url">
          {{ node.title || node.url }}
        </a>
      </div>
      <!-- Children đệ quy -->
      <BookmarkTree
        v-if="node.children && !collapsed.has(node.id)"
        :nodes="node.children"
        :depth="depth + 1"
      />
    </li>
  </ul>
</template>

<style scoped>
.bm-tree { list-style: none; margin: 0; padding: 0; }
.bm-tree--child { padding-left: 16px; }
.bm-tree__item { margin: 0; }
.bm-tree__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  font-size: var(--font-size-sm);
  cursor: pointer;
  border-radius: 2px;
}
.bm-tree__row:hover { background: var(--bg-panel); }
.bm-tree__row--folder { color: var(--accent); font-weight: 500; }
.bm-tree__row--link { color: var(--text-secondary); cursor: default; }
.bm-tree__icon { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.bm-tree__icon--link { color: var(--text-muted); }
.bm-tree__title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-tree__count {
  font-size: 10px;
  color: var(--text-muted);
  padding: 0 4px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.bm-tree__link {
  color: var(--text-secondary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.bm-tree__link:hover { color: var(--accent); text-decoration: underline; }
</style>
```

---

## 8. Chỉnh sửa `public/manifest.json`

Tìm dòng `"permissions"` và thêm `"bookmarks"` và `"downloads"`:

```json
"permissions": ["storage", "identity", "alarms", "clipboardWrite", "bookmarks", "downloads"],
```

---

## 9. Chỉnh sửa `src/constants/storage.ts`

```typescript
export const NOTES_CACHE_KEY = 'notes_cache'
export const FOLDERS_CACHE_KEY = 'folders_cache'
export const LAST_SYNC_KEY = 'last_sync'
export const BOOKMARKS_CACHE_KEY = 'bookmarks_cache'   // ← THÊM
export const ACTIVE_TAB_KEY = 'active_tab'              // ← THÊM (nhớ tab đang mở)
```

---

## 10. Chỉnh sửa `src/pages/App.vue` — Thêm tab switcher

### 10a. Trong `<script setup>` — thêm vào sau các import hiện có:

```typescript
// Import thêm
import BookmarkTab from '@/components/bookmarks/BookmarkTab.vue'

// State
const activeTab = ref<'notes' | 'bookmarks'>('notes')
```

### 10b. Trong template — thêm tab buttons vào `.shell__header-row--actions`:

Tìm `<div class="shell__actions">` và thêm 2 tab button **trước** các button hiện có:

```html
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
<span class="shell__sep-v" aria-hidden="true">|</span>
<!-- ... các button SYNC, EXPORT, SETTINGS, FIND, LOGOUT giữ nguyên ... -->
```

### 10c. Trong template — thay thế `<div v-if="dataReady" class="shell__grid">` block:

```html
<template v-if="dataReady">
  <!-- Tab: Notes (layout 3 cột hiện tại) -->
  <div v-show="activeTab === 'notes'" class="shell__grid">
    <!-- ... giữ nguyên toàn bộ nội dung shell__grid hiện tại ... -->
  </div>

  <!-- Tab: Bookmark -->
  <div v-show="activeTab === 'bookmarks'" class="shell__grid shell__grid--full">
    <BookmarkTab class="shell__col--full" />
  </div>
</template>
```

### 10d. Thêm style vào `<style scoped>` của App.vue:

```css
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
```

---

## 11. Câu hỏi đồng bộ đa trình duyệt — Giải thích rõ

### Cách hoạt động:
```
Chrome máy A  ──backup──►  Supabase (bookmark_backups)  ◄──list──  Edge máy B
                                       ▲
                            user_id giống nhau (đăng nhập cùng account)
```

**Flow cụ thể:**
1. User mở BBQNote trên Chrome → click `[BACKUP NOW]` → snapshot lên Supabase
2. Cài BBQNote trên Edge/Brave → đăng nhập cùng Gmail/email
3. Tab BOOKMARK → Load backups → thấy ngay snapshot từ Chrome
4. Click `[RST]` → restore vào Edge

**Lưu ý quan trọng cho Cursor:**
- `restoreToChrome()` dùng `chrome.bookmarks` ID mặc định ("1" = Bookmarks bar, "2" = Other bookmarks) — các ID cố định này nhất quán trên mọi Chromium browser
- **Không** restore node root "0" và "Managed bookmarks" (policy-controlled)
- Trước khi restore, nên warn user vì sẽ xóa bookmark hiện tại

---

## 12. Checklist cho Cursor thực hiện theo thứ tự

```
□ 1. Chạy SQL 005_bookmarks.sql trong Supabase SQL Editor
□ 2. Tạo src/types/bookmark.ts
□ 3. Tạo src/services/bookmarks.service.ts
□ 4. Tạo src/stores/bookmarks.ts
□ 5. Tạo src/components/bookmarks/BookmarkTree.vue
□ 6. Tạo src/components/bookmarks/BookmarkTab.vue
□ 7. Sửa public/manifest.json — thêm "bookmarks", "downloads"
□ 8. Sửa src/constants/storage.ts — thêm 2 constant
□ 9. Sửa src/pages/App.vue — thêm import + tab switcher + BookmarkTab
□ 10. Build thử: pnpm build
□ 11. Load extension (dist/) trong chrome://extensions → Developer mode
□ 12. Test: Backup → kiểm tra Supabase table bookmark_backups có row
□ 13. Test: Mở trình duyệt 2 → Login → Tab BOOKMARK → Load backups → thấy backup từ trình duyệt 1
```

---

## 13. Ghi chú kiến trúc cho Cursor

- **Không dùng Vue router** cho tab switching — dùng `v-show` + `ref<'notes'|'bookmarks'>` để tránh re-mount
- **Không duplicate** supabase client — import từ `@/services/supabase.ts` hiện có
- **Giữ nguyên** toàn bộ logic Notes/Folders/Sync hiện tại, chỉ thêm bên cạnh
- **RetroConfirm** đã có sẵn trong `src/components/ui/` — dùng cho confirm restore
- CSS variables `--bg-primary`, `--accent`, `--border`, `--danger`, `--text-muted`, `--font-size-sm` đã định nghĩa trong `retro.css` — dùng trực tiếp, không hardcode màu
