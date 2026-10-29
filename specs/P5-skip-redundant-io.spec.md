# P5 — Bớt đọc / ghi thừa (badge đồng bộ, ghi lại cache khi mở popup)

> **Failing test:** `specs/P5-skip-redundant-io.test.mjs`. Kế hoạch: `specs/ROADMAP-P.md`.

## Hiện trạng (đo bằng `scripts/measure-popup-perf.mjs`, chế độ không đăng nhập)

- **Mở popup** (2.000 ghi chú, 800 sự kiện): đọc `notes_cache + note_bodies_cache` (7,2 MB) 3 lần + kho máy 1 lần,
  rồi **luôn ghi lại nguyên cache** (`set notes_cache+note_bodies_cache 7.222 KB`, `set calendar_events_cache`)
  dù không có gì mới. `loadAll` (`stores/notes.ts`, `stores/calendarEvents.ts`) gán lại `notes.value` /
  `bodies.value` bằng mảng mới → cả danh sách tính lại, rồi `persistCache()` đọc-gộp-ghi cả kho.
- **Gõ ghi chú** (800 ghi chú): `SyncStatusBadge.vue:39` nghe **mọi** thay đổi storage — cả cache, cả bản nháp
  ghi vào `storage.session` khi đang gõ — và mỗi lần đọc lại toàn bộ `bbqone_local_notes` + bản sao lưu bookmark +
  sự kiện chỉ để đếm số mục chờ đồng bộ: 6 cặp đọc trong 24 ký tự.

## Sửa

1. **`utils/rowsEqual.ts`** (thuần): `sameRows(a, b)` — cùng tập row theo `id` (không trùng id), từng trường `===`
   (mảng như `tags` so từng phần tử), không quan tâm thứ tự.
2. **`stores/notes.ts`**: `hydrateFromCache()` trả ảnh chụp đĩa `{ notes, bodies }` khi cả hai là **mảng** (khác:
   `null`). `loadAll`: sau khi gộp bản mới với row dirty, nếu bản gộp `sameRows` với **RAM** và với **đĩa** → `return`
   (không gán lại, không `persistCache`). Mọi trường hợp khác giữ y như cũ.
3. **`stores/calendarEvents.ts`**: tương tự — `hydrateFromCache()` trả mảng thô trên đĩa (**chỉ khi là mảng
   chuẩn**; cache hỏng `{0:…}` của bản cũ → `null` → vẫn ghi lại dạng mảng như C11).
4. **`SyncStatusBadge.vue`**: chỉ phản ứng khi `area === 'local'` và có khóa kho máy (`LOCAL_STORAGE_KEYS`) hoặc
   cờ đăng nhập (`BBQ_AUTH_LOGGED_IN_KEY`) đổi; gộp nhịp 250 ms; dọn timer khi unmount.

## KHÔNG được đổi

N5 đọc-gộp-ghi trong `persistCache` (mọi lần ghi thật vẫn đi qua nó); merge-guard C1 (`mergeFreshWithDirtyLocal`
≥ 2 chỗ trong notes.ts); decrypt-overlay của S1 / S2C1 (`decryptLoadedSecureRows` / `decryptLoadedAccountRows` trong
`loadAll`); sửa cache hỏng của C11. Thư mục bảo mật đang mở khóa: RAM là bản rõ ≠ envelope mới tải → không bao giờ
rơi vào nhánh bỏ qua (đi đường cũ).

## Nghiệm thu

Test GREEN; mọi harness khác PASS (đặc biệt C1, C11, N4-N5-N11, S1, S2C1.x); `vue-tsc` sạch; build OK. Đo lại: mở
popup ở trạng thái ổn định **không còn** `set notes_cache+note_bodies_cache` / `set calendar_events_cache`; gõ ghi chú
không còn đọc `bbqone_local_notes` / `bbqone_local_calendar_events` từ badge.
