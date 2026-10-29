# U32 — Thẻ "+n xem thêm" trong ô lịch rộng bằng dòng sự kiện

> **Failing test:** `specs/U32-cell-more-full-width.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29, sau U30):** "+4 more → tag này width = với event đi chuyên gia, hoặc tìm 1 solution phù
> hợp giúp mình".

## Hiện trạng (U30)

Thẻ là viên tròn (`--radius-pill`) ôm sát chữ, cỡ 11 px đậm — lệch khỏi cột pill sự kiện ngay trên, trông như nhãn
lạc chỗ chứ không phải "dòng thứ 3" của ô.

## Sửa (`CalendarCell.vue`, chỉ CSS)

Thẻ thành **một dòng của danh sách**: rộng hết cột như pill sự kiện, cùng bo góc 6 px, cùng lề chữ (viền 1 px + 8 px)
→ chữ "+4 xem thêm" thẳng cột với tên sự kiện. Vẫn là nút phụ nên khác pill ở:
- viền **đứt** (`dashed`), nền trong suốt, chữ màu phụ — không nhầm với một sự kiện;
- thấp hơn pill một chút (24 px so với 28 px) để hàng lịch không cao thêm nhiều.
Rê chuột: viền + chữ màu nhấn, nền nhấn nhạt (như cũ). Ngày tháng khác giữ mờ như pill.

## KHÔNG được đổi

Hành vi U30: chỉ hiện khi quá 2 sự kiện, bấm → hộp của ngày (cả ngày đã qua), không lan lên ô, tooltip "Xem cả n sự
kiện".

## Nghiệm thu

Test GREEN; mọi harness khác PASS; build OK. Chromium (sáng + tối): thẻ cùng mép trái / phải với pill, chữ thẳng cột với
tên sự kiện, hàng không bị cắt.
