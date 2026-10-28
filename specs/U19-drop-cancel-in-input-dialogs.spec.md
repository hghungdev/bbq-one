# U19 — Bỏ nút "Hủy" trong hộp nhập liệu (giữ ✕ + một nút chính)

> **Failing test:** `specs/U19-drop-cancel-in-input-dialogs.test.mjs` (cấu trúc) + ảnh Chromium.
> **Quyết định (Sir, 2026-10-28):** đồng ý đề xuất — hộp nhập liệu chỉ còn ✕ ở góc + một nút chính có chữ;
> hộp xác nhận xóa vẫn giữ "Hủy" + "Xóa".

## Quy tắc

| Loại hộp thoại | Nút | Lý do |
|---|---|---|
| **Nhập liệu / chọn** (tạo, sửa, chuyển, nhập mật khẩu, thiết lập) | ✕ ở góc + **một** nút chính | ✕, Esc, bấm ra ngoài đã là "Hủy" — nút "Hủy" thứ tư thừa |
| **Xác nhận hành động không hoàn tác** (xóa) | "Hủy" + "Xóa" | lựa chọn an toàn phải nằm ngay cạnh lựa chọn nguy hiểm |
| **Quyết định nhiều nhánh** (xung đột đồng bộ: giữ máy này / giữ tài khoản / để sau) | giữ cả 3 | "để sau" là một lựa chọn thật |

## Sửa

| Hộp | Trước | Sau |
|---|---|---|
| Sự kiện mới / Sửa | Hủy · Lưu | **‹** (về danh sách ngày) ở đầu tiêu đề · ✕ · Lưu |
| Tạo nhanh (thư mục / ghi chú) | Hủy · Tạo | ✕ · Tạo |
| Chuyển ghi chú | chỉ có Hủy ở chân | ✕ (bấm thư mục = chuyển) — bỏ chân |
| Thư mục bảo mật (mật khẩu) | Hủy · OK, **không có ✕** | tiêu đề + ✕ · OK |
| Bật mã hóa tài khoản (3 bước) | bước 1: Hủy · Tiếp tục, **không có ✕** | ✕ ở góc; "Quay lại" bên trái, nút chính bên phải ở mọi bước |
| Xếp lại sự kiện vượt giới hạn (sau đồng bộ) | Hủy · Trước · Sau · Lưu | ✕ · Trước · Sau · Lưu |

Giữ: hộp xác nhận xóa (RetroConfirm), Xóa thư mục, Xóa bản sao lưu, Xung đột đồng bộ.

## Đổi assertion test cũ (có chủ đích)

- **U13.S4** chân Sửa sự kiện: không còn "Hủy" → kiểm nút **‹** về danh sách ở đầu tiêu đề.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium: Sửa sự kiện → ‹ → về danh sách ngày; ✕ → đóng hẳn; Esc vẫn đóng; Tạo thư mục; Thư mục bảo mật
   có ✕. Light + dark.
