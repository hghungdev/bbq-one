# U27 — ☀ giao diện về lại header, đứng trước ⚙: ☀ › ⚙ › tài khoản

> **Failing test:** `specs/U27-theme-before-settings.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** "Move dark/light lên lại, đứng trước Setting: Dark/Light > Setting > User." Sau đó
> rà soát lần cuối → Sir đưa lên Google Store từ `main`.

## Sửa

- Header phải: **☀ / ☾ giao diện → ⚙ Cài đặt → tài khoản** (thứ tự Gmail: công cụ → cài đặt → avatar).
- Đáy thanh dọc chỉ còn **☁ đồng bộ** (đã đăng nhập) / **☁ chờ đồng bộ** (chưa đăng nhập, chỉ hiện khi có thay đổi chờ).
- ☀ trên header dùng cỡ header (32 px, icon 17 px) — không còn bị CSS `:deep` của thanh dọc phóng to.

## Đổi assertion cũ có chủ đích

- **U26.1** — đáy thanh: trước ☀ → ☁; nay chỉ ☁.
- **U26.2** — header: trước chỉ ⚙ → tài khoản; nay ☀ → ⚙ → tài khoản.
- **U24.4** — trước: header không có ☀ (`ThemeModeToggle` = −1); nay ☀ đứng trước ⚙.

## Nghiệm thu (rà soát lần cuối trước khi lên Store)

1. Test GREEN; mọi harness PASS; `vue-tsc` sạch; build OK; `dist/manifest.json` = 2.0.0, đủ icon.
2. Chromium (ẩn danh + đăng nhập, sáng + tối): header ☀ ⚙ avatar / Đăng nhập; ☀ đổi giao diện; ⚙ mở Cài đặt; menu
   tài khoản; 3 mục thanh dọc chuyển tab; bảng ☰; ☁ đồng bộ; không lỗi console.
