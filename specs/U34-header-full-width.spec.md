# U34 — Header chạy hết bề ngang; logo ra sát mép trái; thanh dọc nằm dưới header, icon dưới logo

> **Failing test:** `specs/U34-header-full-width.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29, kèm ảnh):** "Thanh dọc category mình nghĩ nên lùi xuống và để thanh ngang đè lên, đưa logo
> và text ra ngoài bìa, các category sẽ dưới logo — cảm nhận cá nhân, nhờ chuyên gia đánh giá lại".

## Đánh giá

**Đồng ý — nên đổi.** Hiện tại (U20 / U28) thanh dọc cao hết popup, icon Lịch đang chọn (viên xanh) nằm ngay góc trên
trái — chỗ mắt nhìn đầu tiên — và đứng ngang hàng logo nên hai thứ "giành" vai nhận diện; logo bị đẩy vào trong 56 px,
trông như nằm lệch. Đổi sang **thanh trên cùng + thanh dọc bên dưới** (kiểu Gmail / Google Calendar / Slack):

- Góc trên trái thuộc về thương hiệu; logo canh **cùng trục dọc với cột icon** (tâm x = 28 px) → logo ở trên, các mục
  ngay dưới — đọc từ trên xuống thành một nhóm điều hướng.
- Header một dải liền, đổ bóng nhẹ lên thanh dọc ("đè lên") → phân cấp rõ: header (toàn cục) > thanh dọc (điều hướng)
  > nội dung.
- Không tốn chỗ: nội dung vẫn bắt đầu ở cùng toạ độ (dưới header 58 px, cạnh thanh dọc 56 px); thanh dọc mất 58 px
  trên cùng nhưng chỉ có 3 mục + ☁ ở đáy, thừa chỗ. Chip lịch còn được thêm chỗ ngang (header rộng thêm 56 px −
  khoảng logo lùi ra).

## Sửa (`pages/App.vue`)

1. Khung: `.shell` xếp **cột** — `<header class="shell__header">` (con trực tiếp, hết bề ngang) rồi
   `<div class="shell__body">` (hàng: `<nav class="shell__rail">` + `<div class="shell__main">`). Nội dung header,
   thanh dọc, cột nội dung giữ nguyên (chip lịch, ☀ ⚙ tài khoản, ☁ đáy thanh, tooltip U28, phím ↑ ↓).
2. Logo: header lề trái **12 px** → logo 32 px có tâm x = 28 px = giữa thanh dọc 56 px.
3. Header nổi trên thanh dọc: `position: relative; z-index: 30` (thanh dọc 20 — tooltip U28 vẫn nổi trên nội dung;
   bảng chip lịch / menu tài khoản trong header vẫn phủ lên nội dung). Bóng đổ header có sẵn rơi lên thanh dọc.
4. Thanh dọc: mục đầu cách mép dưới header 12 px như cũ (padding), ☁ vẫn ở đáy.

## KHÔNG được đổi

Thứ tự ☀ › ⚙ › tài khoản (U22 / U24 / U27); tooltip + bàn phím thanh dọc (U28 / U20); chip lịch (U6 / U30); hộp thoại,
UndoToast (fixed, không ảnh hưởng).

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium (sáng + tối): header từ x = 0 tới 800; tâm logo =
tâm icon thanh dọc (28 px); thanh dọc bắt đầu ngay dưới header; tooltip thanh dọc + bảng chip lịch + menu tài khoản
hiện đúng lớp; ba tab hiển thị bình thường.
