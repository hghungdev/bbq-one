# F4 — Thanh địa chỉ: mỗi section một dòng gợi ý (Enter mở đúng section, Alt+Enter chép section đó)

> **Failing test:** `specs/F4-omnibox-sections.test.mjs`. **Sir (2026-11-03):** ghi chú có nhiều section, gõ `bbq …` thì
> mọi section bị gom vào một dòng (đoạn trích nối chữ của mọi section) — "có cách nào khi search ra nhiều section được
> không, không phải gom vào như hiện tại".

## Hành vi

| Ghi chú | Dòng gợi ý |
|---|---|
| 0–1 section | **Như F1**: một dòng `Tên — Thư mục · …đoạn trích…`; `content` = `Tên #<8 ký tự id ghi chú>` |
| ≥ 2 section, **khớp tên hoặc thẻ** | **Mỗi section có chữ một dòng**, theo thứ tự tab: `Tên [2/5] — Thư mục · …đoạn trích của section đó…` (section rỗng bỏ qua; mọi section rỗng → một dòng như F1) |
| ≥ 2 section, chỉ khớp nội dung / nhãn | **Chỉ các section khớp**, mỗi section một dòng, đoạn trích quanh chữ khớp |

- `[i/n]` = section thứ i trên n tab (đúng số `[i]` của tab chưa có chữ trong trình soạn). Chế độ **Chỉ tên** (S12):
  `Tên [2/5]` — vẫn không đoạn trích, không thư mục.
- Xếp hạng: nhóm theo ghi chú như F1 (khớp tên trước, rồi mới sửa trước); trong một ghi chú theo thứ tự section; giới
  hạn 5 dòng tính trên tổng số dòng.
- `content` của dòng section = `Tên [2/5] #<8 ký tự id ghi chú>/<8 ký tự id section>` (Chrome cần mỗi gợi ý một
  `content` khác nhau).
- **Enter** → popup mở đúng ghi chú **và đúng tab section** (`/dashboard?note=<id>&section=<id>` →
  `notes.selectNote(noteId, sectionId)`). **Alt+Enter** → chép **chỉ section đó** (`noteCopyText([section])`); dòng của
  ghi chú 0–1 section vẫn chép cả ghi chú như F1. Section đã bị xóa giữa chừng → mở / chép cả ghi chú.
- Không đổi: chỉ đọc dữ liệu trên máy, không gọi mạng; bỏ thư mục bảo mật + ghi chú khóa; chế độ Tắt (S12); không thêm
  quyền.

## Sửa

1. **`src/utils/omniboxNotes.ts`**
   - `OmniboxSection { body, index, count }`; `OmniboxHit.section?: OmniboxSection | null`.
   - `searchNotesForOmnibox`: tách mỗi ghi chú thành các dòng theo bảng trên; đoạn trích chỉ lấy chữ của section đó.
   - `omniboxDescription`: thêm ` [i/n]` sau tên khi `count > 1` (cả chế độ `'title'`).
   - `omniboxContent(note, untitled, section?)`: thêm ` [i/n]` + `/<8 ký tự id section>` khi `count > 1`.
   - `resolveOmniboxNoteId` nhận cả đuôi `#xxxxxxxx/yyyyyyyy`; mới `resolveOmniboxBodyId(text, noteId, bodies)` →
     id section khi đuôi khớp đúng một section của ghi chú đó, không thì `null`.
   - `omniboxNoteRoute(noteId, bodyId?)` → thêm `&section=<id>`.
2. **`src/background.ts`**: `onInputChanged` truyền `h.section` vào `omniboxContent`; `onInputEntered` lấy `bodyId`
   bằng `resolveOmniboxBodyId`, Alt+Enter chép section đó (không có → cả ghi chú), Enter mở
   `omniboxNoteRoute(noteId, bodyId)`.
3. **`src/pages/App.vue`**: đọc `route.query.section` → `notes.selectNote(noteId, sectionId)` (đã hỗ trợ
   `preferredBodyId`).
4. **i18n** `omnibox.default`: "Alt+Enter copies the section" / "Alt+Enter sao chép phần nội dung".
5. **Tài liệu**: README (bảng Features + phím tắt), mô tả Store (dòng tìm từ thanh địa chỉ), CHROME-STORE-LISTING
   (danh sách tính năng) — mỗi section một gợi ý, Alt+Enter chép section đó. Mục "What changed" theo bản phát hành
   (chưa chốt số phiên bản).

## Test

| Ca | Kiểm |
|---|---|
| F4.1 | Khớp tên, 3 section (1 rỗng) → 2 dòng theo thứ tự, `section.index` 1 và 3, `count` 3; đoạn trích mỗi dòng chỉ có chữ của section đó |
| F4.2 | Chỉ khớp nội dung section 3 → đúng 1 dòng (section 3), đoạn trích quanh chữ khớp |
| F4.3 | Ghi chú 1 section → 1 dòng như F1; thứ tự nhóm (khớp tên trước) + giới hạn tính trên dòng |
| F4.4 | `omniboxDescription`: `[2/3]` sau tên (full + title); `count` 1 → không có |
| F4.5 | `omniboxContent` có `[2/3] #note8/body8`; resolve ra id ghi chú + id section; đuôi cũ → section `null` |
| F4.6 | `omniboxNoteRoute(id, bodyId)` có `&section=`; không bodyId → như F1 |
| F4.7 | background: `omniboxContent(…, h.section)`, `resolveOmniboxBodyId`, chép theo `bodyId`, `omniboxNoteRoute(noteId, bodyId)` |
| F4.8 | App.vue: `route.query.section` → `notes.selectNote(noteId, sectionId)` |
| F4.9 | i18n + README + mô tả Store + listing: Alt+Enter chép section, không còn "copies the whole note" ở phần mô tả tính năng |
