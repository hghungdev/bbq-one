# P4 — Tìm ghi chú nhanh + đúng (tìm trên RAM, trên chữ — không trên thẻ HTML)

> **Failing test:** `specs/P4-note-search-fast.test.mjs`. Kế hoạch: `specs/ROADMAP-P.md`.

## Hiện trạng (đo bằng `scripts/measure-popup-perf.mjs`, 2.000 ghi chú, "trading" khớp mọi ghi chú)

2.0.0: **11.741 ms**, đơ liền 8 s. Sau P3 (vẽ dần): 2.810 ms, đơ 1,3 s. Phần còn lại nằm ở đường tìm:

- **Không đăng nhập** — `notes.service.ts:174–177`: mỗi lần tìm (mỗi nhịp gõ sau 300 ms) đọc lại **toàn bộ** ghi
  chú + body từ `chrome.storage.local` (7 MB), sắp xếp 4.000 body, lọc; rồi `stores/notes.ts:111` lọc **thêm lần
  nữa** trên RAM — dù RAM đã có đủ dữ liệu.
- **Đăng nhập** — `notes.service.ts:143–169`: full-text server lỗi **hoặc không khớp gì** → tải **toàn bộ** ghi chú +
  body từ Supabase (`getAll`, phân trang) về lọc — mỗi nhịp gõ không khớp là tải cả kho qua mạng.
- **Khớp nhầm thẻ HTML** — `filterNotesBySubstring` (`notes.service.ts:201`) so trên `content` thô: gõ `strong`,
  `span`, `class`, `href`, `language-sql`… khớp mọi ghi chú có chữ đậm / link / code block.
- Hai lần tìm chồng nhau (server chậm) → kết quả lần cũ có thể đè lần mới; lỗi server làm `runSearch` reject.

## Sửa

1. **`utils/text.ts`**: `bodySearchText(body)` — plain text **chữ thường** của body, nhớ cùng chỗ với
   `bodyPlainText` (P3, WeakMap theo object body).
2. **`utils/noteSearch.ts`** (mới): `filterNotesByText(notes, bodiesByNote, query)` — giữ nguyên các trường cũ (tên,
   thẻ, nhãn body) nhưng phần nội dung so trên **chữ** (`bodySearchText`), dùng chỉ mục `bodiesByNote` (P3), giữ
   thứ tự đầu vào.
3. **`stores/notes.ts` `runSearch`**: tìm ngay trên RAM bằng `filterNotesByText(notes.value, bodiesByNote.value, q)`
   → hiện kết quả liền. Chỉ khi **đăng nhập** mới gọi thêm `notesService.searchFullText` (full-text server có gốc từ
   tiếng Anh) rồi gộp. Bộ đếm `searchSeq`: kết quả server về muộn của lần tìm cũ bị bỏ. Server lỗi → giữ kết quả RAM
   (không reject).
4. **`notes.service.ts` `searchFullText`**: chỉ còn phần server. Không đăng nhập / lỗi / không khớp → `[]` (RAM đã
   lo); **không** còn `getAll` trong hàm này. Bỏ `filterNotesBySubstring` (đã thay bằng `filterNotesByText`).

## KHÔNG được đổi

Các trường được tìm (tên, thẻ, nhãn body, nội dung), không phân biệt hoa thường, ghi chú khóa (`retronote:`) bị
loại, ghi chú thư mục bảo mật bị lọc ở `NoteList`, sắp xếp mới sửa trước, debounce 300 ms của ô tìm,
`searchFullText` trả `acceptServerRow` (C9.1).

## Đổi hành vi có chủ đích

Tìm `strong` / `class` / `href`… không còn khớp ghi chú chỉ vì định dạng; tìm `Tom & Jerry` khớp nội dung lưu dạng
`Tom &amp; Jerry`.

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Đo lại: tìm trên 2.000 ghi chú **< 300 ms**, không đoạn
đơ nào > 100 ms (sau lần tìm đầu, plain text đã nhớ).
