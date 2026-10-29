# P3 — Danh sách ghi chú nhanh (chỉ mục body, nhớ sẵn plain text, vẽ dần)

> **Failing test:** `specs/P3-note-list-fast.test.mjs`. Kế hoạch: `specs/ROADMAP-P.md`.

## Hiện trạng (đo bằng `scripts/measure-popup-perf.mjs`)

Mở thư mục có 600 ghi chú (2.000 ghi chú, 4.000 body): **3.020 ms**; 240 ghi chú: 688 ms; 90: 222 ms — tăng theo
bình phương.

- `NoteItem.vue:54` `const bodies = computed(() => notes.bodiesForNote(props.note.id))` → `stores/notes.ts:80`
  lọc + sắp xếp **toàn bộ** `bodies` cho **từng dòng** (600 × 4.000). Mỗi computed còn theo dõi từng phần tử của
  mảng → tự lưu một body làm **cả 600 dòng tính lại**, mỗi dòng lại trả mảng mới nên `label` (có thể dựng DOM qua
  `plainTextFromHtml`) cũng chạy lại.
- `noteListLabel` / `searchBodySnippetPlain` (`utils/text.ts`) dựng DOM (`innerHTML`) cho mỗi lần gọi, không nhớ.
- `NoteList.vue` vẽ mọi dòng một lúc (`v-for="n in displayedNotes"`).

## Sửa

1. **`src/utils/noteBodyIndex.ts`** (thuần): `indexBodiesByNote(bodies, prev?)` → `Map<note_id, body[]>` một
   lượt O(N); mỗi nhóm sắp theo `position` (ổn định, **đúng thứ tự cũ** của `bodiesForNote`). Có `prev`: nhóm nào
   không đổi (cùng số phần tử, cùng từng object theo thứ tự) **dùng lại đúng mảng cũ** → dòng của ghi chú khác
   không bị tính lại.
2. **`stores/notes.ts`**: `bodiesByNote = computed((prev) => indexBodiesByNote(bodies.value, prev))` (export ra
   store); `bodiesForNote(id)` đọc từ chỉ mục, vẫn trả **bản sao** (`.slice()`) như cũ cho các chỗ gọi trong store.
3. **`NoteItem.vue`**: `bodies` = `notes.bodiesByNote.get(id) ?? NO_BODIES` (mảng dùng chung, không sao chép).
4. **`utils/text.ts`**: `bodyPlainText(body)` — nhớ plain text theo **object body** (`WeakMap`, tự giải phóng khi
   body bị thay; kiểm lại `content` khi trúng). `noteListLabel` + `searchBodySnippetPlain` dùng nó.
   `plainTextFromHtml` giữ nguyên.
5. **`src/composables/useProgressiveList.ts`**: vẽ `page` (60) dòng đầu; phần tử canh (sentinel) cuối danh sách lọt
   vào khung cuộn (IntersectionObserver, `root` = khung cuộn, dư 240 px) → vẽ thêm 60; sau khi vẽ thêm thì quan sát
   lại (danh sách ngắn vẫn tiếp tục nạp). Đổi thư mục / ô tìm / thẻ lọc → về 60. Dòng phải hiện (ghi chú đang chọn)
   nằm ngoài phần đã vẽ → mở rộng tới trang chứa nó. Dọn observer khi hủy scope.
6. **`NoteList.vue`**: `v-for` trên `visible`; sentinel `ref="sentinel"` khi còn dòng chưa vẽ. Đầu cột vẫn ghi
   **tổng** số kết quả.

## KHÔNG được đổi

Thứ tự hiển thị, nội dung dòng (tên / đoạn trích / ngày), hành vi chọn / đổi tên / xóa / di chuyển, cách
`bodiesForNote` trả bản sao cho store, `plainTextFromHtml` (C13).

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Đo lại: mở thư mục 600 ghi chú **< 300 ms**; gõ trong
editor không làm các dòng khác tính lại; cuộn xuống cuối danh sách 600 dòng vẫn thấy đủ (vẽ thêm khi cuộn).
