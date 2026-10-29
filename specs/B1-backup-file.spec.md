# B1 — Sao lưu ra file JSON (tự động + bằng tay) và khôi phục "thay toàn bộ" — không đăng nhập · bản 2.1.0

> **Failing test:** `specs/B1-backup-file.test.mjs`. Mô tả gốc + câu hỏi: `specs/B1-backup-file-proposal.md`.
> **Sir chốt (2026-10-29):**
> 1. Chỉ người **không đăng nhập**. "Người đăng nhập tải file (không nạp)": **code sẵn, tắt bằng cờ** — cần thì bật.
> 2. Khôi phục = **Thay toàn bộ** (xóa dữ liệu trên máy rồi nạp file), **xác nhận 2 lần** — "như vậy data mới sạch".
> 3. Tự sao lưu **khi mở app** — kiểu Termius (ảnh: công tắc "Sync", "Last synchronization on …", nút "Sync now").
>    "Khi đóng Chrome" không làm được tin cậy (Chrome không báo extension trước khi tắt).
> 4. Có bản sao lưu bookmark trong file — cân nhắc tốc độ + bảo mật (mục "An toàn" dưới).
> 5. Chỉ JSON (Markdown để sau).
> 6. Phiên bản **2.1.0** — quy ước của Sir: chức năng mới tăng số giữa; refactor / nâng cấp lớn tăng số đầu.

## Giao diện — Cài đặt › **Sao lưu** (kiểu Termius)

```
 ▾ Sao lưu
   Tự động sao lưu                                   [●━]   ← công tắc, mặc định BẬT
   Mỗi ngày, lần đầu mở BBQOne mà dữ liệu đã đổi → lưu vào
   Tải xuống/BBQOne (giữ 7 ngày gần nhất).
   Lần sao lưu gần nhất: 29/10/2026 10:15                    ← "Chưa sao lưu lần nào"
   [ ⤓ Sao lưu ngay ]  [ ⤒ Khôi phục từ file… ]
   ⚠ File chứa ghi chú dạng chữ (trừ thư mục bảo mật) — cất cẩn thận.
```

- Chỉ hiện khi **không đăng nhập**. Cờ `FEATURES.backupFileSignedIn` (= `false`): bật thì người đăng nhập thấy mục
  này với **chỉ** "Sao lưu ngay" (đọc từ cache của tài khoản) — không tự động, không khôi phục.
- Công tắc: `role="switch"` + `aria-checked`, bàn phím Space / Enter.

## Tự sao lưu khi mở (`pages/App.vue` → `maybeAutoBackup`)

Sau khi popup / tab vẽ xong (không làm chậm lúc mở), **nếu**: không đăng nhập · công tắc bật · hôm nay chưa kiểm ·
có dữ liệu · dữ liệu khác lần sao lưu trước (SHA-256 của phần `data`) → tải
`BBQOne/bbqone-auto-<thứ>.json` (`mon` … `sun`; tuần sau **ghi đè** cùng thứ → luôn còn 7 ngày gần nhất),
`conflictAction: 'overwrite'`, `saveAs: false`. Dữ liệu không đổi → chỉ ghi "đã kiểm hôm nay" (mỗi ngày đọc toàn kho
**tối đa 1 lần** — giữ thành quả P5).

## Sao lưu bằng tay

"Sao lưu ngay" → `bbqone-backup-YYYY-MM-DD-HHmm.json` vào Tải xuống. Cả hai cách cập nhật "Lần sao lưu gần nhất" +
dấu SHA-256 (sao lưu tay rồi thì hôm đó không tự lưu trùng nội dung).

## Định dạng file

```json
{ "app": "bbqone", "format": 1, "exported_at": "…", "app_version": "2.1.0",
  "counts": { "folders": 0, "notes": 0, "note_bodies": 0, "calendar_events": 0, "bookmark_backups": 0 },
  "data": { "folders": [], "notes": [], "note_bodies": [], "calendar_events": [], "bookmark_backups": [] } }
```

Đọc từ `bbqone_local_*` (dạng lưu thật — ghi chú thư mục bảo mật **giữ nguyên mã hóa**, thư mục giữ muối + bộ kiểm mật
khẩu → nạp ở máy khác mở bằng mật khẩu cũ). Bỏ cờ nội bộ `__synced`.

## Khôi phục — "Thay toàn bộ", xác nhận 2 lần

1. Popup: "Khôi phục từ file…" mở BBQOne trong **tab** (`/dashboard?restore=1` — Chrome đóng popup khi hộp chọn file
   của hệ điều hành mở). Tab: mở Cài đặt › Sao lưu; nút này mở hộp chọn file (`accept=".json,application/json"`).
2. Đọc + kiểm file (mục "An toàn") → **hộp xem trước**: tên file, lúc tạo, bản BBQOne, số mục trong file, số mục bị bỏ
   (kèm lý do), số dữ liệu **hiện có sẽ bị xóa**; "BBQOne sẽ tự tải bản sao lưu dữ liệu hiện tại trước khi thay".
   Nút **Thay toàn bộ…** (đỏ) — **xác nhận lần 1**.
3. Hộp xác nhận (RetroConfirm, đỏ): "Thay toàn bộ dữ liệu trên máy bằng file này? Không hoàn tác được." — **xác nhận
   lần 2**.
4. Áp: (a) có dữ liệu → tải `bbqone-before-restore-YYYY-MM-DD-HHmm.json` (đường lui nếu nạp nhầm); (b) **một lần ghi**:
   `bbqone_local_{folders,notes,note_bodies,calendar_events,bookmarks}` (`__synced: false`, `synced_at: null` —
   sau này đăng nhập vẫn được đẩy lên) + cache tương ứng (`folders_cache`, `notes_cache`, `note_bodies_cache`,
   `calendar_events_cache`, `bookmarks_cache`; `user_id: ''`) + `bbqone_restore_epoch`; xóa
   `bbqone_pending_delete_commits` (xóa chờ hoàn tác không được xóa nhầm dữ liệu mới) và nháp editor trong
   `storage.session`; (c) **tải lại trang** (RAM cũ không được ghi đè dữ liệu mới — N5; thư mục bảo mật tự khóa vì
   khóa chỉ ở RAM) → mở Cài đặt › Sao lưu với dòng "✓ Đã khôi phục: …".
5. Trang BBQOne khác đang mở (popup / tab) thấy `bbqone_restore_epoch` đổi → tự tải lại.

## An toàn (file là dữ liệu ngoài, không tin cậy) — Sir: "user có thể là hacker chèn script / fake link…"

Mô hình đe dọa: file bị sửa có chủ đích để (a) chạy mã trong trang extension (có quyền chrome.*), (b) cài link độc,
(c) làm bẩn prototype / ghi khóa kho lạ, (d) làm treo trang. Biện pháp (utils/backupFile.ts `parseBackup`):

- **Chỉ ghi 5 loại dữ liệu vào đúng khóa kho đã biết** — file không chọn được khóa nào khác (không ghi đè cài đặt,
  phiên đăng nhập, hàng đợi đồng bộ…).
- Lớn hơn **50 MB** → từ chối trước khi đọc. Không phải JSON / `app` ≠ `bbqone` / thiếu `data` → báo lỗi, **không ghi
  gì**. `format` > 1 → "File từ bản BBQOne mới hơn".
- **Danh sách trắng từng trường** + kiểu + độ dài; trường lạ bị bỏ. Chỉ nhận khóa có trong schema (`hasOwnProperty`)
  → khóa `__proto__` / `constructor` trong file **không bao giờ được gán** (không làm bẩn prototype).
- **id + tham chiếu (folder_id, note_id, series_id) phải là UUID**; trùng id → bỏ. Ngày `YYYY-MM-DD`, giờ `HH:MM`,
  thời điểm ISO hợp lệ. Màu sự kiện chỉ `#hex` (chuỗi khác — vd `red;background:url(…)` chèn CSS — → `null`).
- **PBKDF2 1.000 – 5.000.000 vòng** (file đặt 10¹² vòng sẽ treo máy khi mở khóa thư mục bảo mật).
- **Nội dung ghi chú LUÔN qua bộ lọc HTML** `utils/noteHtmlSanitize.ts`: phân tích bằng DOMParser (tài liệu trơ —
  không tải ảnh, không chạy mã) rồi đi qua **đúng schema của trình soạn** (`utils/noteEditorExtensions.ts`, dùng chung
  với NoteEditor) → chỉ còn đoạn văn / tiêu đề / danh sách / trích dẫn / code / đậm-nghiêng-gạch / xuống dòng / kẻ
  ngang; script, style, ảnh, iframe, form, link, thuộc tính `on*` / `style` / `src` bị bỏ. Bộ lọc là **tham số bắt
  buộc** của `parseBackup`. Chỉ bỏ qua bộ lọc với **bản mã hóa thật** (envelope v1 = tiền tố + base64; v2 kiểm chặt
  từng phần) — chuỗi giả dạng `retronote:1:<img …>` vẫn bị lọc.
- Tiêu đề / nhãn là chữ thường, luôn hiển thị qua escape (`highlightQueryHtml`) — `<img onerror>` trong tiêu đề chỉ
  hiện thành chữ.
- Bookmark: chỉ `http:` / `https:` / `ftp:` / `file:` (danh sách trắng, không phân biệt hoa thường); `javascript:`,
  `data:`… bị bỏ + báo. Cây sâu quá 64 tầng → cắt; tối đa 200.000 nút / bản; tối đa 100.000 dòng / loại.
- Ghi: bản thuần JSON (dữ liệu bọc Proxy của Vue bị `chrome.storage` ghi mảng thành object — lỗi bắt được trên
  Chromium khi kiểm); xóa hàng đợi xóa chờ hoàn tác **trước** khi ghi.
- CSP extension (MV3) vẫn chặn script inline / `javascript:` — lớp phòng thủ thứ hai.
- **Tốc độ** (Chromium, file 6,9 MB: 2.000 ghi chú × 2 section + 11 bản × 1.000 bookmark): đọc + kiểm + lọc → hộp xem
  trước **~1,0 s** (bản đầu dựng schema mỗi section: 6,4 s → dựng một lần); ghi + tải lại ~2,5 s.

## Phát hành 2.1.0

manifest / package.json / package-lock.json / DESIGN token = **2.1.0**; README "What changed in 2.1.0"; Store
"Release 2.1.0 (highlights)" + "WHAT'S NEW IN 2.1.0"; permissions doc: `downloads` dùng cả cho file sao lưu (vẫn không
thêm quyền); privacy policy áp dụng từ 2.1.0 + đoạn **Backup files**; ROADMAP ghi quy ước phiên bản.

## Đổi assertion có chủ đích

- **R1.4 / R5.6**: privacy policy "applies to extension version 2.x.y and later" (2.1.0).
- **R5.1 / R5.3 / R5.7**: phiên bản hiện tại (2.1.0); phần lịch sử 2.0.1 (mục README, "Release 2.0.1 (highlights)")
  vẫn kiểm; mục WHAT'S NEW là bản mới nhất.

## KHÔNG được đổi

Quyền manifest; đồng bộ khi đăng nhập; xuất HTML bookmark; F1 (thanh địa chỉ đọc lại sau khi khôi phục — storage đổi).

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium (không đăng nhập):
- Mở popup có dữ liệu → file `BBQOne/bbqone-auto-<thứ>.json` xuất hiện; mở lại cùng ngày → không tải thêm; tắt công tắc →
  không tải.
- "Sao lưu ngay" → file có đúng số mục; ghi chú thư mục bảo mật còn mã hóa.
- Hồ sơ Chrome trống → nạp file (trong tab) → xem trước → 2 lần xác nhận → đủ dữ liệu, thư mục bảo mật mở bằng mật
  khẩu cũ; có dữ liệu cũ → có file `bbqone-before-restore-…`, dữ liệu cũ mất sạch.
- File hỏng / sai app / `javascript:` bookmark → báo đúng, không ghi; file 9 MB → đo thời gian.
