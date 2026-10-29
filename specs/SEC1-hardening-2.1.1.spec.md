# SEC1 — Bản vá bảo mật 2.1.1 (SEC-1, 4, 5, 6, 7, 8 của `SEC-REDTEAM-2026-10-29.md`)

> **Failing test:** `specs/SEC1-hardening-2.1.1.test.mjs`.
> **Sir duyệt (2026-10-29):** "Gom các mục nhỏ thành bản 2.1.1: vá thư viện, escape link khi xuất HTML, lọc \r trong
> lịch, lọc link khi khôi phục bookmark, đổi cách đọc HTML để ảnh không tự tải, siết CSP → ok".

## 1. Vá thư viện (SEC-1, phần không đổi bản lớn)

`npm audit fix` (không `--force`). Bản đóng gói: `prosemirror-view` 1.41.8 → **1.42.8** (XSS khi dán,
GHSA-c8x8-7fp4-3x9w), `vue` 3.5.32 → **3.5.44**, `markdown-it` → 14.3.3, `linkify-it` → 5.0.2, Tiptap 2.27.2 → 2.27.3
(mọi gói Tiptap cùng bản). Công cụ build: `postcss` 8.5.32, `nanoid` 3.3.20, `ws` 8.22.0, `source-map-js` 1.2.2.
`npm audit --omit=dev`: **9 cao → 0 cao**. Còn lại (ghi rõ, làm riêng):
- 24 cảnh báo **vừa** của Tiptap (`mergeAttributes` + `__proto__`, GHSA-cp6q-959q-f8rh) — chỉ vá ở **Tiptap 3** (đổi bản
  lớn, công L). Đang đỡ bởi: CSP MV3 + siết thêm ở mục 5, nội dung nạp từ file đã qua schema (B1).
- `vite` 5 / `esbuild` (cao / vừa) — chỉ máy chủ dev (`npm run dev`), không vào bản build; vá = vite 8 (đổi lớn).

## 2. Xuất bookmark HTML — escape `HREF` (SEC-7)

`bookmarks.service.ts` `exportAsHTML`: `HREF="${escHtml(n.url)}"` (`escHtml` thay `& < > "`). Link có `"` không thoát được
khỏi thuộc tính trong file xuất.

## 3. Lịch (ICS) — ký tự điều khiển (SEC-8)

- `supabase/functions/calendar-feed/ics.ts` `escapeText`: chuẩn hóa `\r\n` / `\r` → `\n`, **bỏ mọi ký tự điều khiển
  khác** (U+0000–U+0008, U+000B–U+001F, U+007F) trước khi escape → không chèn được dòng / thuộc tính mới (URL:, VALARM…)
  vào file Google Calendar. **Sir deploy lại Edge Function** (`supabase functions deploy calendar-feed --no-verify-jwt`).
- Phòng thủ thêm khi nạp file (B1): `utils/controlChars.ts` `stripControlChars` — tên sự kiện / thư mục / ghi chú /
  section / bản bookmark / nút bookmark: ký tự điều khiển → khoảng trắng; mô tả sự kiện: giữ xuống dòng + tab, bỏ phần
  còn lại. (Ô nhập tên sự kiện vốn không nhận xuống dòng.)

## 4. Khôi phục bookmark — lọc link (SEC-4)

- `utils/safeUrl.ts`: `isSafeBookmarkUrl` (chỉ `http:` / `https:` / `ftp:` / `file:`, không phân biệt hoa thường, bỏ
  khoảng trắng đầu), `filterUnsafeBookmarks(tree)` → `{ tree, skipped }` (giữ thư mục, bỏ nút link lạ),
  `countUnsafeBookmarks(tree)`. B1 dùng chung `isSafeBookmarkUrl`.
- `restoreToChrome` khôi phục cây đã lọc, trả về số bị bỏ.
- Hộp xác nhận "Khôi phục" (tab Bookmark): bản có link lạ → thêm dòng "**n bookmark dạng `javascript:` / `data:` sẽ không
  được khôi phục** (bookmarklet — chặn vì an toàn)" trước khi bấm (khôi phục xóa cây hiện tại rồi tạo lại).

## 5. Siết CSP (SEC-5)

`extension_pages`:
`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-src 'none';
base-uri 'none'; form-action 'none'` — ảnh / iframe / form / `<base>` từ ngoài bị chặn; giữ nguyên những gì app dùng
(Shiki WASM, font đóng gói, Supabase).

## 6. Đọc HTML trên tài liệu trơ (SEC-6)

`utils/text.ts` `inertElement()`: phần tử thuộc tài liệu `document.implementation.createHTMLDocument('')` (không cửa sổ →
gán `innerHTML` không tải ảnh / iframe, không chạy gì). Dùng cho `plainTextFromHtml`, `htmlToClipboardPlain`
(`text.ts`), `sanitizeHtmlToNoteContent`, `insertHtmlIntoEditor` (`pastePlainText.ts`). Môi trường không có
`document.implementation` (test dùng document giả) → về `document` như cũ.

## Phát hành 2.1.1

manifest / package.json / lock / DESIGN token = **2.1.1**; README "What changed in 2.1.1"; Store "Release 2.1.1
(highlights)" + mục **WHAT'S NEW IN 2.1.1** (gồm cả sao lưu ra file của 2.1.0 — 2.1.0 chưa lên Store); permissions doc
v2.1.1 (quyền không đổi).

## Đổi assertion có chủ đích

- **B1.30 / B1.31 / B1.32**: phiên bản hiện tại (≥ 2.1.0) thay vì cứng 2.1.0; WHAT'S NEW là bản mới nhất.

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK; `npm audit --omit=dev` 0 cao. Chromium: không vi phạm CSP
nào khi dùng 3 tab (lịch, ghi chú + code tô màu, bookmark), Cài đặt, khôi phục file; ghi chú có `<img src=https://…>`
(đồng bộ / dán) → **0 request ra ngoài** khi tìm / sao chép; khôi phục bản bookmark có `javascript:` → hộp xác nhận báo
số bị bỏ, cây Chrome sau khôi phục không có link lạ; file xuất HTML escape `"`.
