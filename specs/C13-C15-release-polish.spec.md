# C13–C15 — Ba lỗi nhỏ sửa trước khi lên Store (2.0.0)

> **Failing test:** `specs/C13-C15-release-polish.test.mjs`.
> **Bối cảnh (Sir, 2026-10-28):** khi dựng ảnh Store, chuyên gia gặp 3 lỗi có từ trước; Sir: "Cần fix không — mình vẫn
> chưa release lên Store" → sửa trước khi phát hành.

## C13 — Tên Section của ghi chú dính chữ giữa các đoạn

`plainTextFromHtml` (`src/utils/text.ts`) dùng `textContent` → các khối liền nhau ghép không khoảng trắng:
`<p>…search boxes.</p><pre><code>export …` → nhãn "…search boxes.export". Dùng cho nhãn Section (`NoteEditor`), nhãn
ghi chú không tên (`noteListLabel`) và ô đổi tên (`NoteItem`).

**Sửa:** `spaceBlockBoundaries(html)` (thuần) chèn một khoảng trắng sau thẻ đóng khối (`p, div, li, pre, blockquote,
h1–h6, tr, td, th`) và sau `<br>`; `plainTextFromHtml` gọi nó trước khi đọc text. Nội dung trong `<pre>` đã được escape
(`&lt;/p&gt;`) nên không bị ảnh hưởng.

## C14 — Esc không đóng hộp Đăng nhập

`LoginModal` chỉ đóng bằng ✕ / bấm nền; mọi hộp thoại khác đóng bằng Esc (C12). Focus cũng không vào hộp (còn ở nút
"Đăng nhập" trên header).

**Sửa:** khi mở → focus ô Email; lắng nghe `keydown` trên `window` lúc hộp đang mở: Esc → `stopPropagation` + đóng
(bỏ qua khi đang gửi đăng nhập); gỡ listener khi đóng.

## C15 — "(no name)" ở gốc cây Bookmark

`chrome.bookmarks.getTree()` trả về một nút gốc không tên (id `0`) bọc "Thanh dấu trang / Dấu trang khác / …" → cây
hiện "(no name)" ở đầu, và đường dẫn kết quả tìm kiếm bắt đầu bằng "(no name) > …".

**Sửa:** `unwrapBookmarkRoot(nodes)` (`src/utils/bookmarkTree.ts`, thuần): một nút thư mục duy nhất, không tên, không
URL → trả về các con của nó. Dùng khi hiển thị cây (`BookmarkTab`) và khi gom đường dẫn tìm kiếm
(`flattenBookmarkUrls`). Sao lưu / khôi phục / xuất HTML vẫn dùng cây đầy đủ (không đổi dữ liệu).

## Nghiệm thu

1. Test GREEN; mọi harness PASS; `vue-tsc` sạch; build OK.
2. Chromium: nhãn Section "Debounce… inputs." + "export…" có khoảng trắng; Esc đóng hộp Đăng nhập; cây Bookmark bắt
   đầu bằng "Bookmarks bar"; ảnh Store 3 (Bookmark) chụp lại.
