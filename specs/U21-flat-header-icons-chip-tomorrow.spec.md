# U21 — Nhóm ☀ ☁ trên header bỏ "hộp bo góc"; chip ghi đủ "Ngày mai 3"

> **Failing test:** `specs/U21-flat-header-icons-chip-tomorrow.test.mjs` (cấu trúc CSS / i18n) + ảnh Chromium.
> **Yêu cầu (Sir, 2026-10-28):** (1) "2 icon nằm trong hộp bo góc — mình đã bỏ style này rồi";
> (2) "chip nên kéo dài ra để đủ text tomorrow".

## Hiện trạng

- Header phải: ☀ (sáng/tối) + ☁ (đồng bộ) nằm trong một **viên có viền + nền** (`.shell__header-right`), và
  riêng ☁ lại là **một viên có viền** nữa (`.cloud-sync-badge`, trạng thái đổi màu viền + nền) — hộp lồng hộp,
  trái ADN (U11) và khác hẳn thanh dọc vừa làm (icon phẳng).
- Chip: đoạn phụ viết tắt "Tmrw 3" / "Mai 3" — từ hồi header chật (U6). Sau U20 vùng chip rộng 553 px.

## Sửa

- `.shell__header-right`: bỏ viền / nền / lề — chỉ còn hàng icon.
- `CloudSyncStatusBadge` + `SyncStatusBadge`: nút icon phẳng (không viền, không nền), rê chuột tô nhạt như
  `ds-icon-action`; **trạng thái bằng màu icon** (xong = xanh lá ✓, đang đồng bộ = màu nhấn + xoay, chưa lưu /
  lỗi = đỏ); giữ bong bóng số đếm. Cỡ 32 × 32 như ☀.
- i18n `calendar.agenda.tomorrowCount`: "Ngày mai {n}" / "Tomorrow {n}". Tên sự kiện trong chip vẫn tự co theo
  U18 (tên trọn vẹn + "+n").

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Ảnh Chromium light + dark: header phải chỉ còn 2 icon phẳng; chip "… · Tomorrow 3".
