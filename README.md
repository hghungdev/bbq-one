# BBQNote

Extension Chrome (Manifest V3) ghi chú kiểu retro/terminal: thư mục, note rich-text (TipTap), đồng bộ Supabase, folder **secure** mã hóa AES-GCM (passphrase), tìm kiếm full-text.

---

## Tính năng chính

| Khu vực | Mô tả |
|--------|--------|
| **Đăng nhập** | Supabase Auth (email/password), phiên lưu qua Supabase client. |
| **Thư mục & note** | CRUD folder/note, kéo chỉnh độ rộng 2 cột (có min/max), đổi tên folder/note (double-click hoặc **F2**). |
| **Secure folder** | Bật mật khẩu folder (PBKDF2 + AES-GCM); khóa/mở; đổi passphrase; icon khiên (accent) cho folder secure. |
| **Tìm kiếm** | FTS trên Supabase + fallback substring; khi đang gõ SEARCH, cột editor **ẩn** để tránh lệch với note đang chọn; chọn note trong kết quả sẽ tắt search và mở editor. |
| **Đồng bộ** | Cache trong `chrome.storage.local`; **[ SYNC ]** đẩy note “dirty”; service worker đồng bộ định kỳ (~24h). |
| **Xuất** | **[ EXPORT ]** note đang mở dạng `.txt`. |
| **Cài đặt** | Theme/font (xem `SettingsModal` + `settings` store). |

---

## Công nghệ

- **Vue 3** (Composition API, `<script setup>`), **TypeScript** (strict), **Vite 5**
- **Pinia**, **Vue Router** (hash history — phù hợp extension)
- **Supabase** (`@supabase/supabase-js`): Auth, Postgres, RLS
- **TipTap** (`@tiptap/vue-3`, `@tiptap/starter-kit`) cho nội dung note
- **Shiki** highlight code trong editor
- **@crxjs/vite-plugin**: đóng gói MV3

---

## Cấu trúc mã nguồn

```
bbq-note/
├── public/
│   ├── manifest.json          # MV3: popup, permissions, CSP, background SW
│   └── …                      # icon, assets tĩnh
├── src/
│   ├── main.ts                # bootstrap Pinia + router
│   ├── App.vue                # shell: chỉ RouterView
│   ├── background.ts        # alarm ~24h → syncFromCache (SW)
│   ├── env.ts                 # VITE_SUPABASE_* + kiểm tra cấu hình
│   ├── router/index.ts       # /login (public), / (requires auth)
│   ├── pages/
│   │   ├── Login.vue
│   │   └── App.vue            # layout 3 cột: Sidebar | NoteList | NoteEditor
│   ├── components/
│   │   ├── layout/            # Sidebar, NoteList, SearchBar, SettingsModal
│   │   ├── folders/           # FolderItem, SecureFolderModal
│   │   ├── notes/             # NoteEditor, NoteItem, CodeBlock
│   │   └── ui/                # RetroButton, RetroInput, TagInput, …
│   ├── stores/
│   │   ├── auth.ts
│   │   ├── folders.ts
│   │   ├── notes.ts           # searchQuery, runSearch, selectNote, …
│   │   ├── secureFolder.ts    # khóa/mở, key trong memory
│   │   ├── sync.ts
│   │   └── settings.ts
│   ├── services/
│   │   ├── supabase.ts        # client singleton
│   │   ├── auth.service.ts
│   │   ├── notes.service.ts    # CRUD + searchFullText + filterNotesBySubstring
│   │   ├── folders.service.ts
│   │   └── sync.service.ts    # push dirty, encrypt path secure
│   ├── composables/
│   │   └── useColumnResize.ts # chiều rộng cột + min/max + chrome.storage
│   ├── utils/                 # secureCrypto, export, highlight, tiptapJson, …
│   ├── types/index.ts         # Note, Folder, …
│   ├── constants/storage.ts   # keys cache notes/folders
│   └── assets/styles/         # global.css, retro.css
├── supabase/
│   ├── bbqnote_setup.sql      # schema gộp: bảng, FTS, RLS (project mới)
│   └── migrations/            # 001 FTS, 002 RLS, 003 secure folders, 004 …
├── .env.example
├── vite.config.ts             # vue + crx plugin
└── package.json
```

---

## Yêu cầu

- **Node.js** 18+ (khuyến nghị 20)
- Tài khoản **Supabase** (project đã chạy SQL setup + Auth bật email/password)

---

## Cài đặt phát triển

```bash
npm install
cp .env.example .env
# Điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY
npm run dev
```

- `npm run build` — type-check (`vue-tsc`) + build extension vào `dist/`
- `npm run preview` — xem bản build (ít dùng với CRX; chủ yếu load `dist` trong Chrome)
- `npm run type-check` — chỉ kiểm tra TypeScript

---

## Cấu hình môi trường

File **`.env`** (không commit):

| Biến | Ý nghĩa |
|------|---------|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Anon public key (Dashboard → Settings → API) |

`src/env.ts` export `isSupabaseConfigured` và `missingEnvHint` — UI có thể cảnh báo nếu thiếu biến sau khi build.

---

## Database Supabase

1. **Project mới:** mở SQL Editor, chạy **`supabase/bbqnote_setup.sql`** (bảng `folders` / `notes`, trigger `updated_at`, cột `fts`, RLS theo `user_id`).
2. **Bổ sung secure folder:** chạy các file trong **`supabase/migrations/`** theo thứ tự số (003 secure columns, 004 folders `updated_at`, …) nếu project đã có schema cũ — hoặc đảm bảo migration đã áp dụng trên DB thật.

**RLS:** mỗi user chỉ đọc/ghi dòng của mình (policy trong setup).

**FTS:** cột `fts` generated trên `title` + `content` (English config); API dùng `textSearch('fts', …, { type: 'plain' })`.

---

## Build & cài extension Chrome

1. `npm run build`
2. Mở `chrome://extensions` → **Developer mode** → **Load unpacked** → chọn thư mục **`dist/`**
3. Sau khi sửa `.env`, cần **build lại** và **Reload** extension

**Quyền extension** (xem `public/manifest.json`): `storage`, `identity`, `alarms`, `clipboardWrite`; `host_permissions` tới `https://*.supabase.co/*`.

---

## Hướng dẫn sử dụng (người dùng)

1. **Đăng nhập** — email/password đã tạo trong Supabase Auth (Dashboard → Authentication).
2. **Thư mục** — chọn folder trái; `+ FOLDER` tạo mới; kéo thanh dọc giữa FOLDERS và NOTES để chỉnh độ rộng (có giới hạn min/max).
3. **Note** — `+ NOTE` trong folder đang chọn; chọn note để sửa ở cột phải; tag / rich text trong editor.
4. **Đổi tên** — double-click hoặc **F2** trên folder/note đang chọn (khi không focus ô search/editor).
5. **Secure folder** — chuột phải folder → “Secure folder…” để bật; sau đó Unlock / Lock / Đổi passphrase. Nội dung note trong folder secure được mã hóa trước khi gửi server khi đã mở khóa.
6. **Tìm kiếm** — ô **SEARCH** (hoặc **Ctrl+F**); kết quả global (folder thường; secure được lọc khỏi search). Khi có query, editor tạm ẩn; bấm note hoặc **[ X ]** để xem lại editor.
7. **Đồng bộ** — **[ SYNC ]** đẩy thay đổi local chưa sync; badge hiển thị trạng thái. Background có thể sync định kỳ khi cache có note dirty.
8. **Đăng xuất** — **[ LOGOUT ]**; secure store khóa lại; `auth.service` xóa `chrome.storage.local`.

---

## Phím tắt (trong `App.vue`)

| Phím | Hành động |
|------|-----------|
| **F2** | Đổi tên note đang chọn, hoặc folder đang chọn nếu không có note active |
| **Ctrl+F** | Focus ô SEARCH |
| **Ctrl+N** | Tạo note trong folder đang chọn (bị chặn nếu folder secure đang locked) |
| **Ctrl+S** | Flush lưu editor (nếu có) |

---

## Luồng dữ liệu tóm tắt

- **Auth:** `supabase.auth` session; route guard trong `router/index.ts`.
- **Cache:** `notes_cache` / `folders_cache` trong `chrome.storage.local`; `loadAll()` ghi đè sau khi fetch.
- **Sync:** `synced_at` trên note; `isNoteDirty` so sánh `updated_at` vs `synced_at`; secure cần key trong memory để encrypt trước push.
- **Secure:** khóa AES lưu trong session (store), không persist passphrase; PBKDF2 + salt trên `folders` (xem `secureCrypto.ts`).

---

## Ghi chú phát triển

- Popup có **min-width** (~720px) trong CSS global — thiết kế theo cửa sổ extension cố định.
- Hash router tránh conflict với URL extension.
- Service worker **không** có crypto key secure — sync nền chỉ push được khi note đã encrypted hoặc không thuộc secure locked.

---

## License

`private: true` trong `package.json` — điều chỉnh theo repo của bạn.
