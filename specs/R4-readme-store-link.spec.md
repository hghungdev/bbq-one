# R4 — README trỏ tới listing Chrome Web Store

> **Failing test:** `specs/R4-readme-store-link.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29):** "Extension đã đưa release lên chrome store rùi" — nhờ sửa README.

## Cũ so với thực tế

| README | Thực tế |
|---|---|
| Install: "install from the **Chrome Web Store** when the listing is published" | 2.0.0 đã lên Store: `https://chromewebstore.google.com/detail/bbqone/ceapgalokgiaajogfjjkcaidnkpmplll` |
| Đầu trang không có đường tới Store | Người mở repo cần thấy link cài ngay |

## Sửa

- `README.md` › Install: link thật tới listing, bỏ "when the listing is published".
- `README.md` đầu trang (trước Table of contents): badge tĩnh shields.io "Chrome Web Store" trỏ tới cùng link.
  Badge tĩnh (`/badge/...`) — không phụ thuộc shields.io đọc được trang Store.
- Link không mang tham số tài khoản / ngôn ngữ (`authuser`, `hl`) — Store tự chọn ngôn ngữ theo người xem.

## KHÔNG được đổi

Mọi nội dung khác của README (R1.2 vẫn PASS: `**Version:** 2.0.0`, "What changed in 2.0.0", không PIN).

## Nghiệm thu

Test GREEN; mọi harness khác PASS.
