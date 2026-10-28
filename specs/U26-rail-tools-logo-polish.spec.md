# U26 — ☀ ☁ xuống đáy thanh dọc; logo header nét + có viền; icon Chrome vuông hơn

> **Failing test:** `specs/U26-rail-tools-logo-polish.test.mjs` (+ U25 sửa ngưỡng).
> **Phản hồi (Sir, 2026-10-28, sau khi build bản `346782f`):**
> 1. "Dark mode và sync cloud để sidebar bên trái, ở dưới chỗ Setting vừa nãy sẽ ok hơn."
> 2. "Phần logo trong app khá bị vỡ layout, nó sao sao ấy."
> 3. "Cải thiện về size icon ở Chrome rồi nhưng vẫn còn khá nhỏ."

## 1. ☀ ☁ xuống đáy thanh dọc

- Đáy thanh dọc (chỗ ⚙ trước U24): **☀ / ☾ giao diện** rồi **☁ đồng bộ** (đã đăng nhập) hoặc **☁ chờ đồng bộ**
  (chưa đăng nhập, chỉ hiện khi có thay đổi chờ). Cỡ nút như mục thanh dọc (40 × 36, icon 20 px) — chỉnh qua `:deep`
  trong `.shell__rail-bottom`, component giữ nguyên (nhãn / tooltip / màu trạng thái không đổi).
- Header phải chỉ còn **⚙ · tài khoản** (kiểu Gmail).
- Bảng ☰ vẫn chỉ 3 mục (điều hướng); ☀ ☁ dùng khi bảng đóng.

## 2. Logo header "vỡ" — nguyên nhân + sửa

Phóng to ảnh Sir: (a) giao diện sáng — dải giấy trắng trên đỉnh logo gần như trùng nền trắng → chỉ thấy **hai chấm
đen lơ lửng** trên khối xanh, hình như bị vỡ; (b) màn 1x — trình duyệt tự thu ảnh 64 → 32 px nên hơi nhòe.

- Viền tóc theo hình logo khi sáng: token `--brand-logo-edge` (sáng: xám đậm mờ; tối: trong suốt — dải trắng đã nổi
  trên nền tối) + `filter: drop-shadow(0 0 0.6px var(--brand-logo-edge))`.
- Ảnh đúng cỡ từng mật độ: `srcset` 1x = `bbqone-logo-32.png` (32 px), 2x = `bbqone-logo.png` (64 px).

## 3. Icon Chrome vẫn nhỏ

Đã lấp 100 % ngang (U25) nhưng hình **rộng hơn cao** (888 × 782) → ở 16 px chỉ 16 × 14 (icon Google 16 × 16).
`scripts/make-brand-icons.py`: riêng icon Chrome (16/32/48/128) **cắt bớt 50 % phần ngang dư** (hai cánh xòe hai bên,
~3 % mỗi bên) → lấp ~94 % dọc, vẫn giữ dáng xòe. Logo header không cắt (đủ chỗ). Ngưỡng U25: Chrome ≥ 97 % ngang và
≥ 90 % dọc; logo ≥ 94 % / ≥ 80 %. Muốn vuông hẳn 16 × 16 cần bản vẽ vuông riêng cho cỡ nhỏ (designer).

Nguồn: `design/transparent-tight/icon{16,32,48,128}.png` (Chrome) + `logo{32,64}.png` (header).

## Đổi assertion cũ có chủ đích

- **U22.1** — thanh dọc được có `onGoLogin` duy nhất qua `<SyncStatusBadge @sign-in>` (bấm ☁ chờ đồng bộ mời đăng
  nhập — hành vi có từ trước); vẫn không có nút 👤 / ⇥.
- **U22.2, U24.4** — thứ tự header: trước ☀ → ☁ → (⚙) → tài khoản; nay header chỉ ⚙ → tài khoản, ☀ ☁ ở đáy thanh.
- **U24.1, U24.5** — trước: thanh dọc không có khối đáy / bỏ CSS `.shell__rail-bottom`; nay khối đáy chứa ☀ ☁ (vẫn
  không có ⚙). Bảng ☰ vẫn không khối đáy.
- **U23.3, U23.4** — logo app: nguồn `design/transparent-tight/logo64.png`; thẻ `<img>` thêm `srcset`.
- **U25.1, U25.2** — ngưỡng lấp khung riêng Chrome / logo; tên nguồn `logo{32,64}.png`.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium 1x + 2x, light + dark: đáy thanh ☀ ☁; header ⚙ + avatar / Đăng nhập; logo có viền khi sáng, ảnh 32 px
   ở 1x; ☀ đổi giao diện, ☁ đồng bộ vẫn chạy; ảnh so sánh icon Chrome.
