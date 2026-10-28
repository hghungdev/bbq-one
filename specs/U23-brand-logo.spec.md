# U23 — Logo thương hiệu mới: header kiểu Gmail (logo + tên) + icon Chrome

> **Failing test:** `specs/U23-brand-logo.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** "Mình vừa update bộ icon — muốn thay text 'BBQOne' thành icon giống Gmail"; "logo +
> text kế bên như Gmail thế nào, hoặc solution hợp hơn"; "transparent hiển thị trên app, navy hiển thị icon trên
> Chrome — bạn thấy thế nào, hay là transparent luôn?"
> **Nguồn:** `design/transparent/icon{16…1024}.png`, `design/navy/…` (Sir push lên `main`, commit `f82e756`).

## Quyết định (đề xuất của chuyên gia)

1. **Header = logo + tên "BBQOne"** (giống Gmail: logo + chữ "Gmail" màu trung tính). Logo 28 px; chữ đổi từ xanh
   nhấn sang **màu chữ thường** (logo đã mang màu xanh — hai mảng xanh cạnh nhau tranh nhau). Chỉ tốn thêm ~36 px so
   với chữ hiện tại; chip lịch vẫn rộng. Chỉ-logo gọn hơn nhưng logo đọc ra "One", người mới chưa chắc nhận ra
   "BBQOne" → giữ tên. Bảng mở rộng (☰) dùng cùng cụm logo + tên.
2. **Transparent ở mọi nơi** — app **và** icon Chrome (thanh công cụ, trang Extensions, Web Store):
   - một hình nhận diện duy nhất;
   - Chrome tự vẽ nền (sáng / tối) — Web Store khuyên icon nền trong suốt, rõ trên cả hai nền;
   - navy ở 16 px thành ô vuông tối, phần hình bị thu nhỏ; trên Chrome tối ô navy gần như chìm vào nền.
   - Navy để dành cho ảnh quảng bá / ô màu cố định (Web Store promo tile), không làm icon thanh công cụ.

## Sửa

- `public/icon-{16,32,48,128}.png` ← `design/transparent/icon{16,32,48,128}.png` (manifest giữ nguyên tên file).
- `src/assets/brand/bbqone-logo.png` ← `design/transparent/icon64.png` (64 px cho logo 28 px trên màn hình 2x).
- `App.vue`: `.shell__brand` = `<img class="shell__brand-logo" alt="">` (trang trí — tên đã có chữ) +
  `<span class="shell__brand-name">BBQOne</span>`; ở header và đầu bảng mở rộng.
- CSS: logo 28 × 28, không co; tên 16 px, đậm vừa, `--text-primary` (không còn `--accent`).

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK; `dist/` có đủ 4 icon mới.
2. Chromium light + dark: header "logo BBQOne", bảng ☰ cùng cụm; ảnh so sánh có / không chữ cho Sir chọn.
