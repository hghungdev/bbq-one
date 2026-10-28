# U10 — Bảng "Lịch sắp tới": tạm bỏ nút "Ẩn" ở mục Ngày mai

> **Failing test:** `specs/U10-agenda-remove-hide.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** đã có bảng chi tiết như này rồi thì tạm thời bỏ chức năng "Hide" ở
> Tomorrow.

## Sửa

- `CalendarAgendaChip.vue`: bỏ nút "Ẩn" + `onDismissTomorrow`; **không đọc** trạng thái "đã ẩn" trong
  session nữa (nếu vẫn đọc, ai đã bấm "Ẩn" trước bản này sẽ mất phần Ngày mai mà không có cách hiện
  lại) → luôn truyền `null` cho `buildAgenda`.
- i18n: gỡ `calendar.agenda.dismissTomorrow`, `calendar.agenda.dismissTomorrowHint`.
- Giữ nguyên (để bật lại dễ nếu cần): tham số `dismissedTomorrowKey` của `buildAgenda` (có test U6.3–U6.4)
  và `services/calendarBannerDismiss.service.ts` (auth vẫn gọi `clearUpcomingBannerDismiss` khi đăng
  nhập — vô hại).

## Đổi assertion test cũ (có chủ đích — theo yêu cầu)

- **U6.9** bỏ điều kiện "Ẩn dùng `dismissUpcomingBannerForDate`" (giữ Esc / bấm ngoài / mở lịch).
- **U6.14** bỏ 2 khóa i18n của nút "Ẩn".

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch. Bảng "Lịch sắp tới" mục Ngày mai chỉ còn "Mở lịch".
