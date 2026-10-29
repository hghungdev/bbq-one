# B1 — Sao lưu ra file JSON + khôi phục (người không đăng nhập) — BẢN MÔ TẢ, chờ Sir chốt

> **Sir đã chốt (2026-10-29) → đã làm: `specs/B1-backup-file.spec.md` (bản 2.1.0).** Phần dưới giữ nguyên làm lịch
> sử (một số đề xuất đã đổi theo Sir: khôi phục = thay toàn bộ; tự sao lưu khi mở; phiên bản 2.1.0).

## 1. Vì sao cần

Không đăng nhập thì mọi thứ (ghi chú, lịch, bản sao lưu bookmark) **chỉ nằm trong `chrome.storage.local` của hồ sơ
Chrome đó**. Gỡ extension, xóa dữ liệu trình duyệt, hỏng / đổi máy → **mất hết**, không có đường lấy lại. File JSON là
"két sắt" Sir tự giữ: tải về, cất đâu cũng được, khi cần thì nạp lại — vẫn không cần tài khoản, không gửi gì lên mạng.

## 2. Cách dùng

**Sao lưu (tải file):** ⚙ Cài đặt › **Sao lưu & khôi phục** › **Tải bản sao lưu (.json)** → file
`bbqone-backup-2026-10-29.json` vào thư mục **Tải xuống**; toast "Đã lưu vào Tải xuống".

**Khôi phục (nạp file):** cùng mục › **Khôi phục từ file…** → BBQOne mở trong **một tab** (xem 5.1) → chọn file → xem
trước → **Khôi phục**.

```
 ┌─ Cài đặt ──────────────────────────────────────────────┐
 │ ▸ Ngôn ngữ                                              │
 │ ▾ Sao lưu & khôi phục                                   │
 │   Dữ liệu chỉ nằm trên máy này. Tải bản sao lưu để giữ  │
 │   an toàn khi gỡ extension hoặc đổi máy.                │
 │   Lần sao lưu gần nhất: 29/10/2026 10:15                │
 │   [ ⤓ Tải bản sao lưu (.json) ]  [ ⤒ Khôi phục từ file… ]│
 └────────────────────────────────────────────────────────┘

 ┌─ Khôi phục từ file (tab BBQOne) ───────────────────────┐
 │ bbqone-backup-2026-10-28.json · tạo lúc 28/10 21:04     │
 │   12 thư mục · 340 ghi chú · 85 sự kiện · 3 bản bookmark│
 │ Sẽ:  + thêm 20 · ↻ cập nhật 5 (bản trong file mới hơn)  │
 │      = giữ nguyên 432 · ⚠ bỏ qua 2 (ngày đã đủ 6 sự kiện)│
 │ Không xóa gì đang có.                 [ Khôi phục ]  ✕  │
 └────────────────────────────────────────────────────────┘
```

## 3. Trong file có gì

| Gồm | Ghi chú |
|---|---|
| Thư mục (cả thư mục bảo mật) | Thư mục bảo mật giữ **muối + bộ kiểm mật khẩu** → nạp lại ở máy khác vẫn mở bằng mật khẩu cũ |
| Ghi chú + các section | Ghi chú trong thư mục bảo mật giữ **nguyên dạng mã hóa** (file không lộ nội dung) |
| Sự kiện lịch | Gồm giờ, màu, đã xong, chuỗi lặp (`series_id`) |
| Bản sao lưu bookmark | Các bản ☁↑ đã chụp trong BBQOne (cây bookmark tại thời điểm chụp) |
| Không gồm | Phiên đăng nhập, khóa tạm, hàng đợi đồng bộ; giao diện / ngôn ngữ (theo máy) |

Định dạng (đọc được bằng mắt):

```json
{ "app": "bbqone", "format": 1, "exported_at": "2026-10-29T03:15:00.000Z", "app_version": "2.0.2",
  "counts": { "folders": 12, "notes": 340, "note_bodies": 702, "calendar_events": 85, "bookmark_backups": 3 },
  "data": { "folders": [...], "notes": [...], "note_bodies": [...], "calendar_events": [...], "bookmark_backups": [...] } }
```

Cỡ file tham khảo: 2.000 ghi chú (~1,7 KB / section) ≈ 7 MB — tải trong tích tắc.

## 4. Khôi phục hoạt động thế nào (đề xuất: GỘP, không xóa)

| Tình huống | Kết quả |
|---|---|
| Mục trong file **chưa có** trên máy (khác id) | **Thêm** |
| Có rồi, bản trong file **mới hơn** (`updated_at`) | **Cập nhật** theo file |
| Có rồi, bản trên máy mới hơn / bằng | **Giữ nguyên** bản trên máy (sửa gần đây không bị đè) |
| Mục trên máy **không có trong file** | **Giữ nguyên** — khôi phục **không bao giờ xóa** |
| Ngày đã đủ 6 sự kiện | Bỏ qua sự kiện thừa, **báo rõ** từng ngày |
| File hỏng / không phải của BBQOne / định dạng lạ / quá lớn | Báo lỗi, **không ghi gì** |
| Kho máy đầy giữa chừng | Ghi một lần cho mỗi loại; lỗi → báo, phần đã có giữ nguyên |
| Mục đã xóa sau lần sao lưu | Sẽ **hiện lại** (đúng nghĩa "khôi phục") — ghi rõ trong hộp xem trước |

Xong → toast "Đã khôi phục: +20 · ↻5 · bỏ qua 2", tab BBQOne hiện dữ liệu mới; popup mở lần sau cũng thấy.

## 5. Lưu ý / giới hạn

1. **Chọn file phải mở trong tab:** Chrome đóng popup extension khi hộp chọn file của hệ điều hành hiện lên (popup mất
   focus) → trang popup chết trước khi đọc được file. Nút "Khôi phục từ file…" vì vậy mở BBQOne trong một tab
   (đường mở tab đã có — thanh địa chỉ F1 dùng khi không mở được popup) và hộp chọn file chạy ở đó. Tải file thì
   không vướng (Chrome tự lưu, không có hộp hỏi).
2. **Riêng tư:** file chứa ghi chú dạng chữ thường (trừ thư mục bảo mật) — ai có file là đọc được; hộp sao lưu nhắc
   Sir cất file cẩn thận.
3. **File là dữ liệu ngoài, không tin cậy:** kiểm từng trường (kiểu, độ dài tiêu đề sự kiện ≤ 64, id dạng chuỗi…), bỏ
   trường lạ; nội dung ghi chú vẫn đi qua trình soạn Tiptap như mọi ghi chú (chỉ giữ định dạng nó hỗ trợ) và CSP của
   extension không chạy script.
4. **Không thêm quyền:** dùng `downloads` sẵn có (nút ⤓ Xuất HTML của Bookmark đang dùng) → cập nhật lên Store không
   bị Chrome tạm tắt.

## 6. Kỹ thuật (tóm tắt)

- `src/services/backupFile.service.ts` (thuần, test được): `buildBackup(snapshot)`, `parseBackup(text)` (kiểm định
  dạng + làm sạch), `planRestore(file, local, cap)` → `{ add, update, keep, skipped }`, `applyRestore(plan)` — ghi
  `bbqone_local_*` + cache bằng `safeCacheWrite`, rồi `loadAll` để store nạp lại (luồng N5 đọc-gộp-ghi giữ nguyên).
- Settings: mục mới (chỉ hiện khi **không đăng nhập** — xem câu hỏi 1); "Lần sao lưu gần nhất" lưu ở một khóa riêng.
- Tab khôi phục: route `/dashboard?restore=1` → mở Settings ở mục khôi phục; `<input type="file" accept=".json">`.
- Test: harness cho build / parse / plan (file hỏng, sai `app`, `format` lạ, trùng id, mới hơn / cũ hơn, ngày đủ 6,
  thư mục bảo mật) + Chromium: tải file thật, nạp lại trên hồ sơ trống, so khớp.
- Công: **M** (~1,5–2 ngày), rủi ro vừa (đây là chức năng **ghi** dữ liệu).

## 7. Câu hỏi để Sir chốt

1. **Ai thấy chức năng?** Đề xuất: **chỉ khi không đăng nhập** (đăng nhập đã có cloud; nạp file khi đăng nhập dễ đẩy
   nhầm dữ liệu cũ lên cloud). Hay cho cả người đăng nhập **tải** file (chỉ tải, không nạp)?
2. **Khôi phục kiểu nào?** Đề xuất **Gộp** (bảng mục 4, không xóa gì). Hay thêm lựa chọn **Thay toàn bộ** (xóa hết dữ
   liệu máy rồi nạp file — nguy hiểm hơn, phải xác nhận 2 lần)?
3. **Nhắc sao lưu?** Đề xuất: chỉ hiện "Lần sao lưu gần nhất" trong Cài đặt, **không nhắc**. Hay nhắc nhẹ (chấm nhỏ
   trên ⚙) khi quá **30 ngày** chưa sao lưu và đã có dữ liệu?
4. **Bản sao lưu bookmark** có đưa vào file không? (mỗi bản là cả cây bookmark — nhiều bản thì file to hơn). Đề xuất:
   **có**.
5. **Xuất Markdown** (một file `.md` đọc được bằng mắt, ghi chú nhóm theo thư mục — trong kế hoạch gốc): làm **cùng
   đợt** hay **để sau**? Đề xuất: **để sau** — JSON trước cho chắc.
6. Phát hành: **2.0.2** riêng (đề xuất — chức năng ghi dữ liệu, kiểm kỹ) hay gộp vào 2.0.1 (chưa upload)?
