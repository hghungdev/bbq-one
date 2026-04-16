# 🗒️ RetroNote — Chrome Extension Sprint Plan
> Vintage 1989 UI · Vue 3 + TypeScript · Supabase · PKCE Auth

---

## 🎨 Design System — Vintage 1989

### Concept
Giao diện mô phỏng màn hình CRT terminal / DOS editor năm 1989.
Đơn giản tuyệt đối — không icon phức tạp, không animation rườm rà.

### Color Palette
```css
--bg-primary:     #1a1a0e;   /* Màn hình CRT tối */
--bg-secondary:   #0d0d06;   /* Panel tối hơn */
--bg-panel:       #141408;   /* Sidebar */
--text-primary:   #e8d5a3;   /* Amber phosphor */
--text-secondary: #a89060;   /* Dim amber */
--text-muted:     #5a4e35;   /* Very dim */
--accent:         #f0c040;   /* Bright amber highlight */
--border:         #3a3020;   /* Subtle border */
--danger:         #c0392b;   /* Đỏ CRT */
--success:        #27ae60;   /* Xanh phosphor */
```

### Typography
```css
--font-mono: 'IBM Plex Mono', 'Courier New', monospace;
--font-size-base: 13px;
--font-size-sm:   11px;
--font-size-lg:   15px;
```

### UI Rules
- **Tất cả text** dùng monospace font
- **Border** dùng `1px solid` — không bo góc (border-radius: 0)
- **Cursor** text blink animation `█`
- **Selection** màu amber highlight
- **Scrollbar** mỏng, custom style
- **No shadows** — flat hoàn toàn
- **Syntax highlight**: chỉ dùng màu amber/green/dim — không rainbow

---

## 📁 Project Structure

```
retro-note/
├── public/
│   └── manifest.json
├── src/
│   ├── assets/
│   │   └── styles/
│   │       ├── global.css        # CSS variables, reset
│   │       └── retro.css         # CRT effects, scrollbar, selection
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.vue       # Folder list + note list
│   │   │   └── StatusBar.vue     # Bottom bar: user, sync status
│   │   ├── notes/
│   │   │   ├── NoteEditor.vue    # Tiptap editor
│   │   │   ├── NoteItem.vue      # Note trong list
│   │   │   └── CodeBlock.vue     # Syntax highlight block
│   │   ├── folders/
│   │   │   └── FolderItem.vue
│   │   └── ui/
│   │       ├── RetroInput.vue    # Input style vintage
│   │       ├── RetroButton.vue   # Button [  OK  ]
│   │       └── TagBadge.vue      # Tag style
│   ├── pages/
│   │   ├── Login.vue             # Full screen login
│   │   └── App.vue               # Main layout
│   ├── stores/
│   │   ├── auth.ts               # Pinia: user, JWT
│   │   ├── notes.ts              # Pinia: notes CRUD, cache
│   │   ├── folders.ts            # Pinia: folders
│   │   └── sync.ts               # Pinia: sync state
│   ├── services/
│   │   ├── supabase.ts           # Client init + chrome.storage adapter
│   │   ├── auth.service.ts       # Login, logout, PKCE flow
│   │   ├── notes.service.ts      # CRUD + full-text search
│   │   └── sync.service.ts       # Manual sync logic
│   ├── types/
│   │   └── index.ts              # Note, Folder, Tag interfaces
│   ├── utils/
│   │   ├── highlight.ts          # Shiki lazy loader
│   │   └── storage.ts            # chrome.storage adapter
│   └── main.ts
├── vite.config.ts                # CRXJS plugin config
├── tsconfig.json
└── package.json
```

---

## 🗄️ Supabase Schema

```sql
-- Chạy trong Supabase SQL Editor

CREATE TABLE folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users NOT NULL,
  name        TEXT NOT NULL,
  position    INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users NOT NULL,
  folder_id   UUID REFERENCES folders(id) ON DELETE SET NULL,
  title       TEXT DEFAULT '',
  content     TEXT DEFAULT '',
  tags        TEXT[] DEFAULT '{}',
  synced_at   TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Full-text search index
CREATE INDEX notes_fts_idx ON notes
  USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folders_owner" ON folders USING (auth.uid() = user_id);
CREATE POLICY "notes_owner"   ON notes   USING (auth.uid() = user_id);
```

---

## 🚀 Sprint 1 — Foundation + Auth
**Goal**: Bật extension lên → thấy login screen → login được → vào app

### Setup
```bash
# Khởi tạo project
npm create vite@latest retro-note -- --template vue-ts
cd retro-note
npm install

# Core deps
npm install @supabase/supabase-js pinia vue-router

# Build tool cho extension
npm install -D @crxjs/vite-plugin

# Editor + highlight
npm install @tiptap/vue-3 @tiptap/starter-kit
npm install shiki
```

### manifest.json
```json
{
  "manifest_version": 3,
  "name": "RetroNote",
  "version": "1.0.0",
  "description": "Secure note app — Vintage 1989",
  "action": {
    "default_popup": "index.html",
    "default_icon": "icon.png"
  },
  "permissions": [
    "storage",
    "identity"
  ],
  "host_permissions": [
    "https://*.supabase.co/*"
  ]
}
```

### vite.config.ts
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import manifest from './public/manifest.json'

export default defineConfig({
  plugins: [vue(), crx({ manifest })],
  build: { target: 'esnext' }
})
```

### src/utils/storage.ts
```typescript
// chrome.storage adapter cho Supabase Auth
export const chromeStorageAdapter = {
  getItem: async (key: string) => {
    const result = await chrome.storage.local.get(key)
    return result[key] ?? null
  },
  setItem: async (key: string, value: string) => {
    await chrome.storage.local.set({ [key]: value })
  },
  removeItem: async (key: string) => {
    await chrome.storage.local.remove(key)
  }
}
```

### src/services/supabase.ts
```typescript
import { createClient } from '@supabase/supabase-js'
import { chromeStorageAdapter } from '@/utils/storage'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true
  }
})
```

### src/services/auth.service.ts
```typescript
import { supabase } from './supabase'

export const authService = {
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) throw error
    return data
  },

  async logout() {
    await supabase.auth.signOut()
    await chrome.storage.local.clear()
  },

  async getSession() {
    const { data } = await supabase.auth.getSession()
    return data.session
  }
}
```

### src/types/index.ts
```typescript
export interface Note {
  id: string
  user_id: string
  folder_id: string | null
  title: string
  content: string
  tags: string[]
  synced_at: string | null
  updated_at: string
  created_at: string
}

export interface Folder {
  id: string
  user_id: string
  name: string
  position: number
  created_at: string
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'
```

### UI: Login Screen
```
┌─────────────────────────────┐
│                             │
│  RETRONOTE v1.0             │
│  ─────────────────────────  │
│                             │
│  EMAIL:                     │
│  ┌─────────────────────┐    │
│  │ user@example.com    │    │
│  └─────────────────────┘    │
│                             │
│  PASSWORD:                  │
│  ┌─────────────────────┐    │
│  │ ••••••••••          │    │
│  └─────────────────────┘    │
│                             │
│        [ LOGIN ]            │
│                             │
│  > SECURE · ENCRYPTED       │
└─────────────────────────────┘
```

### Checklist Sprint 1
- [ ] Init project với Vite + CRXJS + Vue 3 + TS
- [ ] Setup manifest.json MV3
- [ ] Implement chrome.storage adapter
- [ ] Supabase client với PKCE flow
- [ ] Login page (vintage UI)
- [ ] Auth store (Pinia)
- [ ] Route guard: chưa login → redirect Login
- [ ] Tạo user thủ công trên Supabase dashboard
- [ ] Test login/logout thành công
- [ ] JWT lưu vào chrome.storage.local

---

## 🚀 Sprint 2 — Core CRUD + Layout
**Goal**: Tạo, đọc, sửa, xóa notes. Layout 3 cột hoạt động.

### Layout chính
```
┌──────────────────────────────────────────────────┐
│ RETRONOTE ──────────────────── [SYNC] [LOGOUT]   │  ← Header
├──────────┬───────────────┬────────────────────────┤
│ FOLDERS  │ NOTES         │                        │
│          │               │  NOTE TITLE_           │
│ > GG     │ > GG Sheet    │  ──────────────────    │
│   Sheet  │   SQL Tips    │                        │
│          │   PHP Scripts │  Content here...       │
│ > SQL    │               │  SELECT * FROM notes   │
│ > PHP    │               │  WHERE user_id = $1    │
│          │               │                        │
│ + Folder │ + Note        │  Tags: [sql] [db]      │
├──────────┴───────────────┴────────────────────────┤
│ user@email.com                    UNSAVED · LOCAL │  ← Status bar
└──────────────────────────────────────────────────┘
  120px       200px              auto
```

### src/services/notes.service.ts
```typescript
import { supabase } from './supabase'
import type { Note } from '@/types'

export const notesService = {
  async getAll(): Promise<Note[]> {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create(note: Partial<Note>): Promise<Note> {
    const { data, error } = await supabase
      .from('notes')
      .insert(note)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: Partial<Note>): Promise<Note> {
    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async search(query: string): Promise<Note[]> {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .textSearch('title, content', query)
    if (error) throw error
    return data
  }
}
```

### src/stores/notes.ts
```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notesService } from '@/services/notes.service'
import type { Note } from '@/types'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const activeNoteId = ref<string | null>(null)
  const isDirty = ref(false)  // có thay đổi chưa sync

  const activeNote = computed(() =>
    notes.value.find(n => n.id === activeNoteId.value) ?? null
  )

  async function loadAll() {
    // Load từ chrome.storage trước (offline-first)
    const cached = await chrome.storage.local.get('notes_cache')
    if (cached.notes_cache) notes.value = cached.notes_cache

    // Sau đó fetch từ Supabase
    const fresh = await notesService.getAll()
    notes.value = fresh
    await chrome.storage.local.set({ notes_cache: fresh })
  }

  async function createNote(folderId?: string) {
    const note = await notesService.create({
      title: '',
      content: '',
      folder_id: folderId ?? null,
      tags: []
    })
    notes.value.unshift(note)
    activeNoteId.value = note.id
  }

  async function updateNote(id: string, updates: Partial<Note>) {
    await notesService.update(id, updates)
    const idx = notes.value.findIndex(n => n.id === id)
    if (idx !== -1) notes.value[idx] = { ...notes.value[idx], ...updates }
    isDirty.value = false
  }

  async function deleteNote(id: string) {
    await notesService.delete(id)
    notes.value = notes.value.filter(n => n.id !== id)
    if (activeNoteId.value === id) activeNoteId.value = null
  }

  return { notes, activeNoteId, activeNote, isDirty, loadAll, createNote, updateNote, deleteNote }
})
```

### Checklist Sprint 2
- [ ] Layout 3 cột (Sidebar / NoteList / Editor)
- [ ] Sidebar: folder list, click chọn folder
- [ ] NoteList: hiện notes theo folder, click chọn note
- [ ] NoteEditor: Tiptap headless, tự động save sau 2s (debounce)
- [ ] Create folder / create note
- [ ] Delete note (confirm `[Y/N]?` style vintage)
- [ ] StatusBar: hiện email + trạng thái saved/unsaved
- [ ] Cache notes vào chrome.storage (offline-first load)
- [ ] Folder store (Pinia) tương tự notes store

---

## 🚀 Sprint 3 — Tags + Search + Syntax Highlight
**Goal**: Tìm kiếm nhanh, tag notes, code blocks đẹp

### Syntax Highlight với Shiki (lazy load)
```typescript
// src/utils/highlight.ts
let highlighter: any = null

export async function highlight(code: string, lang: string): Promise<string> {
  if (!highlighter) {
    const { createHighlighter } = await import('shiki')
    highlighter = await createHighlighter({
      themes: ['vitesse-dark'],
      langs: ['javascript', 'typescript', 'sql', 'php', 'bash', 'python', 'json']
    })
  }
  return highlighter.codeToHtml(code, {
    lang,
    theme: 'vitesse-dark'
  })
}
```

### Tag System
- Tags lưu dạng `TEXT[]` trong Postgres
- UI: gõ tag → Enter để thêm, click `[x]` để xóa
- Filter notes theo tag click trong sidebar

```
Tags: [sql ×] [mysql ×] [db ×]  + add tag_
```

### Search UI
```
┌─ SEARCH ──────────────────────┐
│ > _                           │
└───────────────────────────────┘
  ↓ kết quả realtime debounce 300ms
  ┌── GG Sheet ─────────────────┐
  │   ...lấy giá trị cuối cùng │
  ├── SQL Notes ────────────────┤
  │   ...SELECT id FROM...      │
  └─────────────────────────────┘
```

### Checklist Sprint 3
- [ ] Tag input component (gõ + Enter)
- [ ] Filter notes theo tag
- [ ] Search bar (Ctrl+F hoặc click icon)
- [ ] Full-text search gọi Supabase `textSearch`
- [ ] Search kết quả highlight từ khớp
- [ ] Shiki syntax highlight lazy load
- [ ] Code block detection trong Tiptap
- [ ] Shortcut: `Ctrl+N` new note, `Ctrl+S` save

---

## 🚀 Sprint 4 — Sync + Polish + Security
**Goal**: Manual sync hoạt động, UI hoàn chỉnh, bảo mật đầy đủ

### Sync Strategy
```typescript
// src/services/sync.service.ts
export const syncService = {
  async syncToCloud(notes: Note[]) {
    const dirtyNotes = notes.filter(n => !n.synced_at ||
      new Date(n.updated_at) > new Date(n.synced_at))

    for (const note of dirtyNotes) {
      await notesService.update(note.id, {
        ...note,
        synced_at: new Date().toISOString()
      })
    }
  },

  // Trigger: bấm nút SYNC hoặc schedule cuối ngày
  async scheduleDailySync() {
    const lastSync = await chrome.storage.local.get('last_sync')
    const now = new Date()
    const last = lastSync.last_sync ? new Date(lastSync.last_sync) : null

    if (!last || now.getDate() !== last.getDate()) {
      await this.syncToCloud([])
      await chrome.storage.local.set({ last_sync: now.toISOString() })
    }
  }
}
```

### Security Checklist
- [ ] Không hardcode key trong source code
- [ ] Dùng `.env` file: `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`
- [ ] `.env` trong `.gitignore`
- [ ] RLS đã bật trên cả 2 tables
- [ ] Verify RLS: thử query không có JWT → phải fail
- [ ] Content Security Policy trong manifest.json

### manifest.json CSP
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

### Final UI Polish
- [ ] CRT scanline effect (CSS overlay nhẹ)
- [ ] Cursor blink animation trên các input
- [ ] Empty states: "NO NOTES FOUND_" style
- [ ] Loading state: "LOADING..." với dots animation
- [ ] Error messages: `[ERROR] Cannot connect to server`
- [ ] Confirm dialog vintage: `DELETE NOTE? [Y/N]: _`
- [ ] Resize 3 columns bằng drag (optional)

### Checklist Sprint 4
- [ ] Nút SYNC manual trong header
- [ ] Sync status: SYNCED / SYNCING... / UNSAVED
- [ ] Daily auto-sync (background service worker)
- [ ] Export note ra `.txt` file
- [ ] Settings: đổi font size (11/13/15px)
- [ ] Final security audit
- [ ] Test offline → online sync
- [ ] Build production: `npm run build`
- [ ] Load extension vào Chrome → test end-to-end

---

## 📋 Cursor Prompt Templates

### Prompt khởi tạo project
```
Tôi đang build Chrome Extension tên RetroNote với stack:
- Vue 3 + TypeScript + Vite + CRXJS plugin
- Supabase (Auth PKCE + PostgreSQL + RLS)
- Pinia state management
- Tiptap headless editor
- Shiki syntax highlighting (lazy load)
- Design: Vintage CRT terminal 1989, monospace font, amber phosphor color

Đây là SPRINT-PLAN.md của tôi: [paste nội dung]

Hãy bắt đầu Sprint 1: setup project và implement auth flow.
Tuân thủ đúng folder structure và code patterns trong plan.
```

### Prompt mỗi sprint
```
Tiếp tục RetroNote. Đã hoàn thành Sprint [N].
Context hiện tại:
- [list những gì đã làm]
- [vấn đề nếu có]

Bắt đầu Sprint [N+1]. Checklist cần làm:
- [copy checklist từ plan]

Giữ nguyên design system vintage và code patterns đã có.
```

### Prompt fix bug
```
RetroNote Chrome Extension, Vue 3 + TypeScript + Supabase.
Bug: [mô tả bug]
File liên quan: [tên file]
Code hiện tại: [paste code]
Expected behavior: [mô tả]
```

---

## ⚙️ Environment Setup

```bash
# .env (KHÔNG commit file này)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...

# .gitignore
.env
.env.local
dist/
node_modules/
```

## 🔧 Dev Commands

```bash
npm run dev    # Hot reload extension (CRXJS)
npm run build  # Production build → dist/
npm run type-check  # TypeScript check

# Load extension vào Chrome:
# chrome://extensions → Developer mode → Load unpacked → chọn dist/
```

---

*RetroNote — Because the best tools feel timeless.*
