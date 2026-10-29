# Hồ sơ red team — BBQOne

Dùng với skill `redteam-hacker` (`.claude/skills/redteam-hacker/`). Đọc file này + chạy `scripts/recon.sh` là đủ bối
cảnh; không cần dò lại repo.

## Quy ước

- Trả lời + báo cáo **tiếng Việt**; tài liệu gọi người dùng là **"Sir"**.
- Báo cáo: `specs/SEC-REDTEAM-<YYYY-MM-DD>.md`, đánh số tiếp **SEC-13** trở đi (SEC-1…12 ở báo cáo 2026-10-29).
- Kế hoạch vá: `specs/ROADMAP-SEC.md` (thêm mục + bảng Trạng thái).
- Khi Sir duyệt vá: `specs/<ID>-<slug>.spec.md` + `specs/<ID>-<slug>.test.mjs` → commit `docs(<ID>): spec + failing
  test` (RED) → code → `feat/fix(<ID>): …` (GREEN); làm thẳng trên `main`. Phiên bản: vá = số cuối, chức năng mới = số
  giữa, nâng cấp lớn ảnh hưởng nhiều = số đầu (`package.json` → `npm run sync-version`).
- Lệnh: test `for f in specs/*.test.mjs; do node "$f" >/dev/null 2>&1 || echo FAIL $f; done`; kiểu
  `npx vue-tsc --noEmit -p tsconfig.app.json`; build `cp -n .env.example .env; npm run build` (ra `dist/`).

## Stack & ranh giới tin cậy

- Chrome extension **MV3** (popup + trang `index.html` mở trong tab + service worker `src/background.ts` + offscreen),
  Vue 3 + TS + Pinia, trình soạn **Tiptap** (ProseMirror), tô màu code **Shiki** (WASM), **Supabase** (Auth email +
  mật khẩu, Postgres + RLS, Edge Function `calendar-feed`). **Local-first**: không đăng nhập vẫn dùng đủ (dữ liệu ở
  `chrome.storage.local`).
- Ranh giới: trang web ↔ extension (không có cửa — xem phòng thủ); người dùng ↔ người dùng (RLS); máy ↔ cloud (dữ liệu
  đồng bộ về coi là không tin cậy: tài khoản có thể bị chiếm); file ngoài (sao lưu B1, bookmark) ↔ app.

## Tài sản

Ghi chú (kể cả thư mục bảo mật — AES-GCM, khóa chỉ ở RAM), bản sao lưu bookmark, lịch (+ link Google Calendar ICS),
phiên Supabase, cây bookmark Chrome của người dùng.

## Cửa vào

| Nguồn | Ai điều khiển | Chỗ code |
|---|---|---|
| Dán HTML vào ghi chú | Trang web vừa sao chép | `utils/pastePlainText.ts`, `components/notes/NoteEditor.vue` |
| Đồng bộ từ Supabase | Kẻ chiếm tài khoản | `services/localFirst/*`, `stores/*` |
| Nạp file sao lưu (B1) | Ai đưa file | `utils/backupFile.ts` `parseBackup` |
| Cây bookmark / bản sao lưu bookmark | Extension khác, Chrome Sync, tài khoản bị chiếm | `services/bookmarks.service.ts` |
| Thanh địa chỉ `bbq …` | Người gõ | `background.ts` ~301–330, `utils/omniboxNotes.ts` |
| Query URL `?restore=` `?note=` `?q=` | Link mở `chrome-extension://…` | `pages/App.vue` ~242–250 |
| Menu chuột phải (chữ chọn) | Trang web | `background.ts` ~142 |
| Tên / mô tả sự kiện → ICS | Người dùng / tài khoản bị chiếm | `supabase/functions/calendar-feed/ics.ts` |

## Phòng thủ đã kiểm (2026-10-29, bản 2.1.1)

- Không `content_scripts`, `externally_connectable`, `web_accessible_resources` → trang web không nói chuyện được với
  extension. Host chỉ `https://*.supabase.co/*`.
- CSP `extension_pages`: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; style-src 'self'
  'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-src
  'none'; base-uri 'none'; form-action 'none'` (SEC-5).
- Mọi `v-html` qua `escapeHtml`; `escapeXml` cho omnibox; `sanitizeNoteHtml` theo schema Tiptap
  (`utils/noteHtmlSanitize.ts`, schema dùng chung `utils/noteEditorExtensions.ts` — **không có mark `link`**).
- Phân tích HTML trên tài liệu trơ: `inertElement()` (`utils/text.ts`) (SEC-6).
- URL bookmark: danh sách trắng `isSafeBookmarkUrl` (`utils/safeUrl.ts`) khi khôi phục + nạp file (SEC-4); xuất HTML
  escape `HREF` (SEC-7).
- Ký tự điều khiển: `stripControlChars` (`utils/controlChars.ts`) khi nạp file; ICS `escapeText` bỏ điều khiển (SEC-8).
- B1: danh sách trắng từng trường, `hasOwnProperty`, UUID, trần 50 MB / 100k dòng / độ sâu 64, PBKDF2 1.000–5.000.000.
- RLS `auth.uid() = user_id` mọi bảng; RPC `bbq_update_*_if_current` là `SECURITY INVOKER`; feed token 256 bit, sai /
  tắt đều 404.

## Còn mở (xem `specs/ROADMAP-SEC.md`)

SEC-1 phần Tiptap 3 (T1), vite dev (T2), SEC-2 2FA, SEC-3 file sao lưu chữ thường, SEC-9 PBKDF2 310k + lỗi đổi salt
nhiều máy, SEC-10 CI, SEC-11 xóa tất cả bookmark, SEC-12 omnibox.

## Kịch bản PoC (hồi quy bảo mật)

```bash
npm run build
```
```bash
node .claude/skills/redteam-hacker/references/poc-browser.mjs --extension dist --seed specs/redteam/seed.json --scenario specs/redteam/bbqone-scenario.mjs --out /tmp/bbqone-poc
```
`seed.json` gieo ghi chú có ảnh theo dõi / `onerror` / `javascript:` + bản sao lưu bookmark có `javascript:` / `data:`;
kịch bản đi Lịch → Ghi chú (Shiki, tìm, dán HTML độc) → Bookmark (khôi phục). Kết quả 2026-10-29: 0 alert, 0 request
ra ngoài, 0 vi phạm CSP, cây Chrome chỉ còn `https:`. Selector chính: `.shell__rail-item` (0 Lịch, 1 Ghi chú,
2 Bookmark), `.note-item`, `.note-editor__prose`, `#bbqone-notes-search`, `.bm-tab__backup-item`, `.retro-confirm`.

## Các lần rà soát

| Ngày | Phạm vi | Báo cáo | Kết quả |
|---|---|---|---|
| 2026-10-29 | Toàn bộ (bản 2.1.0) | `specs/SEC-REDTEAM-2026-10-29.md` | 12 ca; SEC-1 (phần vá), 4, 5, 6, 7, 8 đã vá ở 2.1.1 |
