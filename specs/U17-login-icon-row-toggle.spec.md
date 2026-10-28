# U17 — Icon "Đăng nhập" dễ nhầm "Đăng xuất"; bấm tên sự kiện = đánh dấu xong

> **Failing test:** `specs/U17-login-icon-row-toggle.test.mjs` (cấu trúc) + kiểm bằng Chromium.
> **Yêu cầu (Sir, 2026-10-28, 2 ảnh):**
> 1. "Khi chưa login mà để icon là logout".
> 2. Danh sách sự kiện của ngày: "click checkbox hoặc title thì đồng nghĩa như click checkbox — khi nào
>    click vào pencil mới hiện edit".

## 1. Icon đăng nhập

U15 đổi 🔒 → ⇤ (mũi tên vào cửa). Nhưng ⇤ và ⇥ (đăng xuất) chỉ là ảnh lật của nhau — ở cỡ 17 px nhìn như
một. Đổi nút khi **chưa đăng nhập** sang icon **người** (👤 — quy ước "Tài khoản / Đăng nhập" của Google,
Microsoft, Amazon…), giữ nền nhấn nhạt để nổi như lời mời. Đã đăng nhập: giữ ⇥ "Đăng xuất". Gỡ `log-in`
khỏi bộ icon (không ai dùng), thêm `user`.

## 2. Dòng sự kiện trong danh sách ngày

| Bấm vào | Trước | Sau |
|---|---|---|
| ô tick | đánh dấu xong / bỏ | như cũ |
| **tên sự kiện** | mở màn Sửa | **đánh dấu xong / bỏ** (cả vùng ô tick + vạch màu + tên là một `<label>`) |
| ✎ | mở màn Sửa | như cũ — **cách duy nhất** để sửa từ danh sách |
| 🗑 | hỏi xóa | như cũ |

Tên ô tick cho trình đọc màn hình = chính tên sự kiện (bỏ `aria-label` chung chung "Đánh dấu hoàn thành",
chữ đó chuyển thành tooltip của dòng).

## Đổi assertion test cũ (có chủ đích)

- **U15.T1** danh sách tên icon: `log-in` → `user`.
- **U15.M5** header: `log-in` → `user`.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium: chưa đăng nhập → icon người; bấm tên "Shinhan" → is_done đổi, màn Sửa KHÔNG mở; bấm lại →
   bỏ đánh dấu; bấm ✎ → màn Sửa. Light + dark.
