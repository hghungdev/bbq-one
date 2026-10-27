# U3 — Sự kiện lặp lại (tuần / tháng / năm)

> **Failing test:** `specs/U3-calendar-recurring.test.mjs` — `node specs/U3-calendar-recurring.test.mjs`
> **Thiết kế + lý do chọn mô hình:** `specs/ROADMAP-U.md` § U3.

## Yêu cầu

Sir: "hôm nay thêm event A, lặp lại tuần sau thì tự động add vào tuần sau". Modal **Sự kiện mới**
chỉ có ô Tiêu đề.

## Mô hình

**Tạo sẵn từng lần lặp** — mỗi lần là một row `calendar_events` bình thường (không migration).
Đánh dấu xong / sửa / xóa từng lần độc lập; search, sync, giới hạn 3 sự kiện/ngày giữ nguyên.

## Thay đổi

1. **`src/utils/calendarRecurrence.ts` (mới, thuần)**
   - `RecurrenceFreq = 'none' | 'weekly' | 'monthly' | 'yearly'`
   - `RECURRENCE_DEFAULT_COUNT = { weekly: 4, monthly: 6, yearly: 3 }`,
     `RECURRENCE_MAX_COUNT = { weekly: 52, monthly: 24, yearly: 10 }`
   - `recurrenceDates(startKey, freq, count)` → mảng `YYYY-MM-DD` gồm cả ngày gốc; số lần chặn
     trong `[1, max]`; `none` → `[startKey]`.
     Tuần +7 ngày. Tháng/năm: lấy ngày-trong-tháng của **ngày gốc**, tháng thiếu → ngày cuối tháng
     (không cộng dồn → 31/01, 28/02, **31/03**). 29/02 hằng năm → 28/02 năm không nhuận.
     Dựng bằng `new Date(y, m, d)` local → `formatLocalDate` (không lệch múi giờ).
2. **`src/stores/calendarEvents.ts`** — `createRecurringEvents(input, { freq, count })`:
   lần lượt từng ngày; ngày đã đủ `CALENDAR_MAX_EVENTS_PER_DAY` (hoặc `createEvent` ném
   `MAX_EVENTS_PER_DAY`) → đưa vào `skipped`, đi tiếp; lỗi khác → dừng và ném (các lần đã tạo giữ
   nguyên, như tạo đơn lẻ). Trả `{ created, skipped }`. Mỗi lần đi qua `createEvent` (offline /
   local-first như cũ).
3. **`src/components/calendar/CalendarEventModal.vue`** — chỉ khi **tạo mới**: select **Lặp lại**,
   ô **Số lần** (`repeatCount`, min 2, max theo tần suất, đổi tần suất → về mặc định), dòng xem
   trước (tối đa 5 ngày đầu + "… → ngày cuối") và số ngày sẽ bị bỏ qua vì đã đủ. Lưu:
   `freq === 'none'` → `createEvent` như cũ; khác → `createRecurringEvents`; có `skipped` → báo
   lại trên modal (`calendar.repeat.resultSkipped`).
4. **i18n vi/en** — `calendar.modal.field.repeat`, `calendar.repeat.{none,weekly,monthly,yearly,
   count,preview,previewSkip,resultSkipped}`.

## KHÔNG đổi

- `createEvent` (single), giới hạn 3/ngày, schema DB, sync, mã hóa.
- Modal ở chế độ **sửa** không có tùy chọn lặp.

## Nghiệm thu

1. Test GREEN; trên `23ebf85` RED 6 fail. Mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Verify tay: tạo "Họp" hằng tuần × 4 từ hôm nay → 4 tuần liên tiếp có "Họp"; đánh dấu xong 1 lần
   không ảnh hưởng lần khác; hằng tháng từ ngày 31 → tháng 30 ngày rơi vào ngày 30; ngày đã đủ 3
   sự kiện → modal báo bỏ qua ngày đó.
