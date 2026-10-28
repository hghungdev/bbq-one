# U16 — 3 tab trên header: bỏ kiểu "Bootstrap" (nút đặc xanh) → tab viền (outline)

> **Failing test:** `specs/U16-header-tabs-outline.test.mjs` (cấu trúc template / CSS) + ảnh Chromium.
> **Yêu cầu (Sir, 2026-10-28):** "ở header 3 category đang xài bootstrap không phải outline".

## Hiện trạng

Tab Lịch / Ghi chú / Bookmark là `RetroButton` bị ghi đè bằng `:deep()` + `!important`; tab đang chọn
**tô đặc màu nhấn, chữ trắng** — đúng kiểu `nav-pills` của Bootstrap. Nó nặng hơn cả nút hành động chính
("Sao lưu ngay"), trong khi tab chỉ là điều hướng.

## Thiết kế

```
 ┌──────────────────────────────────────────┐
 │ ╭────────╮                               │
 │ │ Lịch   │   Ghi chú    Bookmark         │   rãnh nhạt như nhóm icon bên phải
 │ ╰────────╯                               │   tab chọn: VIỀN màu nhấn + chữ màu nhấn + nền rất nhạt
 └──────────────────────────────────────────┘   tab khác: chữ xám, rê chuột → chữ đậm hơn + nền nhạt
```

- Chỉ hành động chính mới tô đặc (Sao lưu ngay, Lưu…) — điều hướng thì viền, đúng quy tắc ADN.
- Nút `<button role="tab">` riêng (bỏ RetroButton + `:deep` + `!important`).
- Bàn phím đúng mẫu tablist: ← → / Home / End chuyển tab, chỉ tab đang chọn nằm trong vòng Tab.

## KHÔNG đổi

Tên tab, thứ tự, hành vi chuyển tab, Ctrl+F theo tab; nhóm icon bên phải; chip lịch.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Ảnh Chromium light + dark 3 tab; chip lịch không bị co thêm.
