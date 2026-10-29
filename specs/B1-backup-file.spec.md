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

## An toàn (file là dữ liệu ngoài, không tin cậy)

- Lớn hơn **50 MB** → từ chối trước khi đọc. Không phải JSON / `app` ≠ `bbqone` / thiếu `data` → báo lỗi, **không ghi
  gì**. `format` > 1 → "File từ bản BBQOne mới hơn — hãy cập nhật extension".
- Từng dòng: kiểm kiểu từng trường, **bỏ trường lạ**; dòng sai kiểu / trùng id → bỏ + đếm. Section không có ghi chú →
  bỏ; ghi chú trỏ thư mục không có → về "không thư mục". Sự kiện: ngày `YYYY-MM-DD`, tên ≤ 64, mô tả ≤ 5.000, tối đa
  **6 / ngày** (giữ theo `position`).
- Bookmark: chỉ giữ đường dẫn `http:` / `https:` / `ftp:` / `file:`; `javascript:`, `data:`… bị bỏ + báo (file bị sửa
  có thể cài bookmark chạy mã khi bấm). Cây sâu quá 64 tầng → cắt.
- Nội dung ghi chú vẫn đi qua trình soạn Tiptap (chỉ giữ định dạng nó hỗ trợ); CSP của extension không chạy script.
- **Tốc độ:** 2.000 ghi chú + 11 bản bookmark ≈ 9 MB — đọc + kiểm < 0,5 s, ghi một lần; đo trên Chromium (Nghiệm thu).

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
