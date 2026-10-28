# U20 — Thanh điều hướng dọc (navigation rail) thay 3 tab trên header

> **Failing test:** `specs/U20-navigation-rail.test.mjs` (cấu trúc) + ảnh Chromium trước / sau.
> **Nhánh thử:** `claude/ui-nav-rail` (từ `claude/dazzling-wright-m0fqb2`) — Sir duyệt rồi mới gộp.
> **Quyết định (Sir, 2026-10-28):** phương án A — thanh dọc kiểu Google; **thu gọn = chỉ icon** (như Gmail),
> **mở rộng = icon + chữ, nổi đè lên nội dung**; ⚙ Cài đặt + 👤 Tài khoản ở **đáy thanh**. Mục tiêu: chip
> thông báo trên header rộng ra.

## Số đo trước (popup 800 px)

Logo + 3 tab: 325 px · chip: 265 px · nhóm icon phải (sáng/tối, đồng bộ, ⚙, 👤): 154 px.

## Thiết kế

```
┌────┬─────────────────────────────────────────────────────┐
│ ☰  │ BBQOne   [● Hôm nay  HSBC T1279 · OT - 2 Hours ⌄]  ☀ ☁ │  header: logo + chip (rộng) + sáng/tối + đồng bộ
├────┼─────────────────────────────────────────────────────┤
│(📅)│                                                     │  mục đang chọn: nền nhấn nhạt bo tròn + icon màu nhấn
│ 📝 │                 nội dung tab                        │  rê chuột: tooltip tên mục
│ 🔖 │                                                     │
│    │                                                     │
│ ⚙  │                                                     │  đáy: Cài đặt
│ 👤 │                                                     │  đáy: Đăng nhập (👤) / Đăng xuất (⇥)
└────┴─────────────────────────────────────────────────────┘
Bấm ☰ → bảng nổi đè (không đẩy nội dung — popup chỉ 800 px):
┌──────────────────┐
│ ☰  BBQOne        │
│ 📅  Lịch         │   chọn mục → chuyển tab + đóng bảng
│ 📝  Ghi chú      │   Esc / bấm ra ngoài → đóng, focus về ☰
│ 🔖  Bookmark     │
│                  │
│ ⚙  Cài đặt       │
│ 👤  Đăng nhập    │
└──────────────────┘
```

- Thanh 56 px; icon 20 px trong ô 40 px; mục chọn = viên nền nhấn nhạt + icon màu nhấn (không tô đặc).
- Bàn phím: thanh là tablist dọc — ↑ ↓ (và ← →) / Home / End chuyển mục, roving tabindex.
- Icon mới trong bộ chung: `menu`, `calendar`, `notes`, `bookmark`.

## Đổi assertion test cũ (có chủ đích)

- **U16** (tab viền trên header): tab không còn nằm trên header — kiểm trên thanh dọc: vẫn `<button role="tab">`
  (v-for), không RetroButton / `!important`; mục chọn chữ / icon màu nhấn, không tô đặc; bàn phím tablist.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Ảnh Chromium trước / sau (light + dark) 3 tab + bảng mở rộng; đo bề rộng chip (mục tiêu ≥ 500 px).
3. Bàn phím: ↓ chuyển tab; ☰ → Enter mở bảng, Esc đóng, focus về ☰.
