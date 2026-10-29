# F1 — Tìm ghi chú từ thanh địa chỉ (`bbq …`): Enter mở, Alt+Enter sao chép cả ghi chú

> **Failing test:** `specs/F1-omnibox-search.test.mjs`. Bản mô tả gốc: `specs/F1-omnibox-proposal.md`.
> **Sir chốt (2026-10-29):** từ khóa **`bbq`**; **Enter = mở**, **Alt+Enter = sao chép**; sao chép **cả ghi chú**
> (mọi section); **không** tìm lịch.

## Hành vi

| Thao tác | Kết quả |
|---|---|
| Thanh địa chỉ: `bbq` + Space / Tab, gõ từ khóa | Gợi ý **mỗi ghi chú khớp một dòng** (tối đa 5): `Tên — Thư mục · …đoạn trích…`, chữ khớp trong tên in đậm. Khớp tên trước, rồi nội dung; mới sửa trước. Dòng đầu (mặc định): "Tìm “…” trong BBQOne · Enter mở · Alt+Enter sao chép" |
| **Enter** trên gợi ý | Mở popup BBQOne, tab Ghi chú, **đúng ghi chú đó** |
| **Alt+Enter** trên gợi ý | **Sao chép cả ghi chú** (mọi section theo thứ tự, cách nhau 1 dòng trống; chữ thường, code giữ xuống dòng) — không mở gì; icon BBQOne hiện **✓** (xanh) ~1,5 s, lỗi thì **!** (đỏ) |
| Enter / Alt+Enter ở dòng mặc định | Mở BBQOne, tab Ghi chú, ô tìm điền sẵn từ khóa |
| Không có kết quả | Dòng mặc định đổi thành "Không thấy ghi chú nào khớp “…” · Enter để mở BBQOne" |
| Ghi chú khóa (thư mục bảo mật / tiêu đề hay nội dung là envelope mã hóa) | Không hiện |
| Lịch / bookmark | Không tìm |

Không đăng nhập / đăng nhập đều chạy: đọc `notes_cache` + `note_bodies_cache` + `folders_cache` (thiếu cache → kho
`bbqone_local_*`), **không gọi mạng**. Không thêm quyền (`omnibox` là khóa manifest, không cảnh báo; sao chép dùng
`clipboardWrite` + `offscreen` sẵn có; mở tab dự phòng bằng `chrome.tabs.create` không cần quyền `tabs`).

## Sửa

1. **`src/utils/omniboxNotes.ts`** (thuần, chạy trong service worker — không có `document`):
   - `htmlToTextNoDom(html)`: khối (`p`, `div`, `li`, `pre`, `blockquote`, `h1–6`, `tr`, `br`) → xuống dòng; bỏ thẻ;
     giải mã `&amp; &lt; &gt; &quot; &#39; &nbsp;` + `&#NNN;` / `&#xHH;`; gộp dòng trống thừa, trim.
   - `noteCopyText(bodies)`: section theo `position`, mỗi section `htmlToTextNoDom`, nối bằng `\n\n` (bỏ section rỗng).
   - `searchNotesForOmnibox({ notes, bodies, folders, query, limit = 5 })`: khớp tên / thẻ / nhãn / chữ trong body
     (như P4 — không khớp thẻ HTML), bỏ ghi chú khóa + thư mục bảo mật; xếp khớp-tên trước, rồi `updated_at` mới
     trước; trả `{ note, snippet, titleMatch }`.
   - `omniboxDescription(hit, folderName, query, untitled)`: XML hợp lệ cho Chrome — escape `& < > " '`, `<match>`
     quanh chữ khớp trong tên, `<dim>— Thư mục · …đoạn trích…</dim>`.
   - `omniboxContent(note, untitled)` = `Tên #<8 ký tự đầu id>`; `resolveOmniboxNoteId(text, notes)` → id khi `text`
     kết thúc bằng `#<8 hex>` khớp đúng một ghi chú, không thì `null` (chữ người dùng gõ).
   - `omniboxNoteRoute(id)` = `/dashboard?note=<id>`; `omniboxSearchRoute(q)` = `/dashboard?q=<encodeURIComponent(q)>`.
2. **`public/manifest.json`**: `"omnibox": { "keyword": "bbq" }`.
3. **`src/background.ts`**: tách `copyViaOffscreen(text)` (luồng offscreen hiện có, vẫn `withWebLock(OFFSCREEN_CLIPBOARD_LOCK`)
   dùng chung cho message `copy-to-os-clipboard` và omnibox. `onInputChanged` → `suggest(...)` + `setDefaultSuggestion`
   (vi / en theo `ui_lang`); dữ liệu nhớ trong SW, làm mới khi các khóa cache đổi. `onInputEntered(text, disposition)`:
   gợi ý + `disposition !== 'currentTab'` (Alt+Enter) → sao chép + badge; còn lại → `openPopupAt(route)`:
   `BBQ_PENDING_ROUTE_KEY` + `chrome.action.openPopup()`, lỗi → `chrome.tabs.create(index.html#route)`.
4. **`src/pages/App.vue`**: sau khi nạp cache — `route.query.note` có thật → tab Ghi chú + `notes.selectNote(id)`;
   `route.query.q` → tab Ghi chú + `notes.runSearch(q)`; rồi `router.replace('/dashboard')` (không áp lại).
5. i18n vi + en: `omnibox.default`, `omnibox.noResults`. Tài liệu: README (Tính năng + Phím tắt), mô tả Store, privacy
   policy (chữ gõ sau `bbq` chỉ đến BBQOne, tìm trên máy), CHROME-STORE-PERMISSIONS (khóa `omnibox`).

## KHÔNG được đổi

Quyền trong manifest; luồng sao chép của nút ⧉ (popup thử `navigator.clipboard` trước, rồi message
`copy-to-os-clipboard`); N13 (`OFFSCREEN_CLIPBOARD_LOCK`); menu chuột phải "Open Dashboard"; tìm kiếm trong popup (P4).

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK; `dist/manifest.json` có `omnibox.keyword = "bbq"`, quyền
không đổi. Chromium: gọi trực tiếp các sự kiện omnibox trong service worker (`onInputChanged` / `onInputEntered`) → gợi ý
đúng; Enter mở đúng ghi chú; Alt+Enter → clipboard có cả ghi chú + badge ✓; `?q=` mở ô tìm điền sẵn.
