# C12 — Esc không đóng được hộp xác nhận (RetroConfirm)

> **Failing test:** `specs/C12-confirm-escape.test.mjs` (cấu trúc) + kiểm bằng Chromium.
> **Phát hiện khi kiểm U15 (2026-10-28):** mở "Xóa sự kiện?" → bấm Esc → hộp vẫn nằm đó.

## Nguyên nhân

`RetroConfirm` mở ra thì focus vào panel; panel có `@keydown.stop` (để Esc / Enter không lọt xuống hộp
thoại bên dưới — vd hộp Sửa sự kiện nghe Esc trên `window`). Nhưng chính `RetroConfirm` cũng nghe Esc
trên `window` → phím đã bị chặn ở panel nên **không bao giờ tới** → Esc vô tác dụng. Ảnh hưởng mọi hộp
xác nhận: xóa sự kiện, xóa ghi chú, khôi phục bookmark, xóa tất cả bookmark…

## Sửa

Panel tự xử lý phím: luôn chặn lan xuống (giữ hành vi cũ), riêng Esc → `dismiss()` (đóng **chỉ** hộp xác
nhận; hộp thoại bên dưới vẫn mở). Giữ trình nghe trên `window` cho trường hợp focus nằm ngoài panel.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium: Sửa sự kiện → 🗑 → Esc → hộp xác nhận đóng, hộp Sửa vẫn mở, sự kiện chưa bị xóa; Esc lần
   nữa → đóng hộp Sửa.
