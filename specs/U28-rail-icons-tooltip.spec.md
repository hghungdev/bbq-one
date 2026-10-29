# U28 — Thanh dọc chỉ icon + tooltip (bỏ ☰ và bảng mở rộng)

> **Failing test:** `specs/U28-rail-icons-tooltip.test.mjs`. Kế hoạch: `specs/ROADMAP-P.md`.
> **Yêu cầu (Sir, 2026-10-29, kèm ảnh bảng ☰ đang mở):** "Sider bar bên trái này mình không cần bấm vào phóng to ra
> mà mặc định là những icon category, rê chuột vào sẽ là tooltip".

## Hiện trạng (U20)

`pages/App.vue`: đầu thanh dọc có nút ☰ (`railOpen`, `openRail`) mở **bảng nổi đè** (`shell__drawer`: logo + 3 mục
có chữ, Esc / bấm ngoài để đóng). Ba icon Lịch / Ghi chú / Bookmark chỉ có `title` gốc của trình duyệt — hiện sau
~1 s, trông thô, không hiện khi focus bằng bàn phím.

## Sửa

- **Bỏ** nút ☰, bảng `shell__drawer` (+ scrim, Transition), `railOpen` / `railMenuRef` / `drawerRef` / `openRail` /
  `closeRail` / `selectTab` / `onDrawerKeydown`, CSS `.shell__drawer*` / `.shell-drawer-*`, i18n
  `app.rail.expand` / `app.rail.collapse`, icon `menu` (không còn ai dùng).
- **Tooltip** cho từng mục: `<span class="shell__rail-tip" aria-hidden="true">{{ t(tab.label) }}</span>` trong nút
  (tên đọc cho trình đọc màn hình vẫn là `aria-label`; bỏ `:title` để không hiện 2 tooltip). CSS: nằm **bên phải**
  icon, nền đảo màu (`--text-primary` / `--bg-primary` → hợp cả sáng lẫn tối), mặc định ẩn (`opacity: 0`,
  `pointer-events: none`), hiện khi `:hover` hoặc `:focus-visible` (trễ 150 ms để lướt chuột qua không nháy). Thanh
  dọc `position: relative; z-index` để tooltip nổi trên cột nội dung.
- Giữ nguyên: tablist dọc + ↑ ↓ / Home / End (U20.5), ☁ ở đáy thanh (U26), logo + tên ở header.

## Đổi assertion có chủ đích

U20.2 (`:title` → tooltip), U20.4 (bảng ☰ → không còn), U20.6 (bỏ icon `menu`), U20.7 (bỏ i18n mở rộng / thu gọn),
U22.1 / U24.2 / U26.3 (không còn bảng → điều kiện "bảng tồn tại" bỏ / đảo), U23.4 (cụm logo chỉ còn ở header: 2 → 1).

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium: thanh dọc chỉ 3 icon (không ☰); rê chuột /
Tab tới icon → tooltip tên mục bên phải; light + dark.
