# U35 — Bookmark: bỏ hàng thanh công cụ; ô tìm luôn hiện ở đầu cột Bookmark trình duyệt

> **Failing test:** `specs/U35-bookmark-search-in-column.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29, kèm ảnh):** "Bookmark này 1 row trống để cho 1 chức năng search, nó kiểu lẻ loi — có thể
> dời nó đi vị trí khác phù hợp hơn không".

## Hiện trạng (sau U33)

Thanh công cụ tab Bookmark chỉ còn 🔍 ở mép phải (+ "Sao lưu lần cuối: …" sau khi vừa sao lưu, chỉ trong phiên) — cả
một hàng ~46 px cho một nút, hai cột bên dưới bị đẩy xuống.

## Đánh giá / phương án

Đặt ô tìm **ngay trên thứ nó lọc**: đầu cột BOOKMARK TRÌNH DUYỆT — kết quả (KẾT QUẢ · n) hiện ngay bên dưới, cùng một
khung. Dạng ô luôn hiện có 🔍 (`InlineSearch persistent`) — đúng kiểu ô "Tìm trong tất cả ghi chú" ở đầu cột Thư mục
(U11), hai tab đọc giống nhau. Chữ gợi ý nói rõ phạm vi: "Tìm trong bookmark và bản sao lưu…" (tìm cả cây trình duyệt
lẫn mọi bản sao lưu).

## Sửa (`BookmarkTab.vue`)

1. Bỏ `bm-tab__toolbar`; thân tab lên sát header (lề trên 12 px) → hai cột cao thêm ~34 px.
2. `<InlineSearch persistent …>` ở đầu `bm-tab__tree-col` (trước SectionHeader), **dính đầu khung khi cuộn cây**
   (`position: sticky`, nền như khung). Giữ Ctrl+F (`searchFocusRequest`), `setSearchQuery` / `clearBookmarkSearch`;
   Esc: lần 1 xóa chữ, lần 2 rời ô (hành vi `persistent`).
3. Đầu KẾT QUẢ bỏ ✕ "Xóa tìm kiếm" — ✕ của ô tìm nằm ngay trên, trùng việc (bỏ luôn i18n `bookmark.clearTitle`).
4. "Sao lưu lần cuối: …" vào tooltip + aria-label của ☁↑ (`Sao lưu ngay · Sao lưu lần cuối: …`); bản sao lưu mới
   vẫn hiện ngay đầu danh sách làm phản hồi.
5. i18n `search.placeholderBookmarks`: "Tìm trong bookmark và bản sao lưu…" / "Search bookmarks & backups…".

## Đổi assertion có chủ đích

- **U5.9** (U4-U6): ô tìm ở đầu cột Bookmark trình duyệt thay vì thanh công cụ.
- **U11** C1: không còn hàng thanh công cụ (vẫn không RetroButton / nút đặc).
- **U15** M3: ✕ của KẾT QUẢ thôi (✕ nằm trong ô tìm); ☁↑ vẫn ở đầu cột SAO LƯU.
- **U33** U33.1 / U33.2 / U33.4: không còn thanh công cụ; tooltip ☁↑ = `backupTitle` (kèm "lần cuối").

## KHÔNG được đổi

Tìm toàn cục (cây trình duyệt + mọi bản sao lưu), nút "Cây" ở từng nhóm kết quả, ⤓ ⟳ 🗑, ☁↑, ↶ 🗑 từng bản sao lưu.

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium: hết hàng trống, hai cột bắt đầu ngay dưới
header; gõ "mail" → KẾT QUẢ ngay dưới ô; ✕ / Esc xóa; Ctrl+F focus ô; cuộn cây dài → ô tìm dính đầu khung; tooltip ☁↑
có "lần cuối" sau khi sao lưu; sáng + tối.
