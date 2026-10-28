# U24 — ⚙ Cài đặt lên header (kiểu Gmail); thanh dọc chỉ còn các mục

> **Failing test:** `specs/U24-settings-in-header.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** "⚙ Cài đặt — nếu được dời lên trên giúp mình giống Gmail luôn, vì sidebar của Gmail
> chỉ để category thôi."

## Sửa

- **Header phải** theo thứ tự Gmail (⚙ đứng ngay trước avatar): ☀ · ☁ · **⚙** · tài khoản.
  ⚙ dùng `IconButton` như ☀ (cùng cỡ, icon 17 px), `aria-label` / tooltip "Cài đặt", bấm → mở Settings.
- **Thanh dọc:** chỉ còn ☰ + 3 mục (Lịch / Ghi chú / Bookmark) — bỏ `shell__rail-bottom`.
- **Bảng mở rộng (☰):** chỉ còn cụm logo + 3 mục — bỏ `shell__drawer-bottom`. Bỏ CSS chết của hai khối đó.

## Đổi assertion cũ có chủ đích

- **U20.3** — trước: ⚙ ở đáy thanh, header không có ⚙. Nay: thanh không có ⚙; ⚙ ở header.
- **U22.1** — trước: đáy thanh + bảng mở rộng "chỉ còn ⚙". Nay: thanh + bảng không có ⚙ lẫn 👤 / ⇥.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium light + dark: header ☀ ☁ ⚙ avatar; bấm ⚙ mở Settings; thanh dọc 4 nút; bảng ☰ không còn Cài đặt.
