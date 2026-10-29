# F3 — Sửa / xóa cả chuỗi sự kiện lặp (theo sau U3)

> **Failing test:** `specs/F3-calendar-series.test.mjs`. Kế hoạch: `specs/ROADMAP-P.md` (mục 2.1 · F3).
> **Yêu cầu (Sir, 2026-10-29):** "Ưu tiên giúp mình … Số 7a — Sửa / xóa cả chuỗi sự kiện lặp. Mình sẽ update trên
> supabase: `ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS series_id uuid NULL;`"

## Hiện trạng (U3)

`createRecurringEvents` tạo sẵn từng lần lặp bằng `createEvent` — mỗi lần là một row độc lập, **không có gì nối các
lần với nhau**. Đổi tên / xóa "Họp tuần" × 4 phải làm 4 lần. U3 đã ghi "Theo sau: sửa/xóa cả chuỗi cần cột
`series_id` (migration)".

## Dữ liệu

- **`supabase/migrations/018_calendar_series.sql`**: `ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS
  series_id uuid NULL;` + `NOTIFY pgrst, 'reload schema';` (PostgREST nhận cột mới ngay). **Sir chạy TRƯỚC khi phát
  hành**: đồng bộ đẩy sự kiện bằng upsert mọi cột (`syncEngine.service.ts:258`) — bảng thiếu cột thì đẩy lỗi. Cột cho
  phép rỗng → bản 2.0.x vẫn chạy bình thường sau migration. RLS, RPC `bbq_update_calendar_event_if_current`, link
  Google Calendar (chỉ đọc cột cố định) không đổi.
- **`types/calendar.ts`**: `CalendarEvent.series_id?: string | null` (row cũ trong cache / kho máy không có trường
  này = không thuộc chuỗi); `CalendarEventCreateInput.series_id?: string | null`.
- **Tạo**: `calendarEventsService.create` (server) và `localCalendarEventsService.create` chỉ ghi `series_id` khi
  **có giá trị** (sự kiện đơn không gửi cột → vẫn tạo được dù server chưa chạy migration).
- **`createRecurringEvents`**: một `crypto.randomUUID()` cho cả chuỗi, truyền cho mọi lần lặp.

## Store (`stores/calendarEvents.ts`)

- `type SeriesScope = 'one' | 'following' | 'all'` (export).
- `seriesTargets(id, scope)`: `one` hoặc không thuộc chuỗi → chỉ chính nó; `following` → cùng `series_id` và
  `event_date >=` ngày của sự kiện đó; `all` → cả chuỗi. Sắp theo ngày.
- `seriesSize(id)`: số sự kiện cùng chuỗi (không thuộc chuỗi = 1).
- `updateSeries(id, scope, updates)`: `updateEvent` lần lượt cho từng mục (offline / xung đột như cũ).
- `deleteSeries(id, scope)` → `deleteEvents(ids)`: gỡ cả nhóm khỏi RAM + cache (C16 `removedIds`), **một** lượt
  hoàn tác cho cả nhóm, id hành động `calendar:<id1>,<id2>,…`; commit xóa từng mục (lỗi mạng → `throw`, giữ hàng đợi
  như C3; lỗi khác → khôi phục mục đó). `deleteEvent(id)` = `deleteEvents([id])` (id hành động / thông báo không
  đổi).

## Hàng đợi xóa (`services/pendingDeleteCommit.service.ts`)

`parseUndoDeleteTargets(actionId)`: như `parseUndoDeleteActionId` nhưng tách danh sách id (cách bằng `,` — UUID
không có dấu phẩy). `executePendingDelete` xóa **mọi** id; `listUnexpiredPendingDeletes` trả **từng** id (ẩn đúng
các row đang chờ xóa khi tải lại — N4). `parseUndoDeleteActionId` giữ nguyên.

## Giao diện (`CalendarEventModal.vue`)

- **Sửa** sự kiện thuộc chuỗi (`seriesSize > 1`): dưới ô Tiêu đề thêm nhóm **Áp dụng cho** — segmented (cùng kiểu
  U13) `[Sự kiện này | Từ đây về sau | Cả chuỗi]`, mặc định **Sự kiện này**, dòng phụ "Sẽ sửa n sự kiện". Lưu →
  `updateSeries`.
- **Xóa** (🗑 ở danh sách ngày hoặc trong form): hộp xác nhận (`RetroConfirm`, thêm `<slot />` dưới dòng mô tả) có
  cùng nhóm lựa chọn + "Sẽ xóa n sự kiện"; tiêu đề "Xóa sự kiện lặp?". Mở từ form thì mặc định theo lựa chọn đang có
  trong form. Xác nhận → `deleteSeries`.
- **Danh sách ngày**: sự kiện thuộc chuỗi có dấu ↻ nhỏ (icon `repeat`, tooltip "Sự kiện lặp").
- i18n vi + en.

## KHÔNG được đổi

Tạo lặp (U3: ngày, số lần, bỏ qua ngày đủ 3), sửa sự kiện đơn, đánh dấu xong từng lần, C3 (commit lỗi mạng → throw),
C16 (xóa không hồi sinh), N4 (ẩn row đang chờ xóa). Chuỗi tạo **trước** bản này không có `series_id` → vẫn sửa / xóa
từng cái (không đoán ghép theo tên).

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium (không đăng nhập): tạo "Họp tuần" × 4 → mỗi
lần có ↻; sửa lần 2 "Từ đây về sau" → lần 2–4 đổi tên, lần 1 giữ; xóa lần 3 "Cả chuỗi" → mất cả 4, hoàn tác → về đủ 4;
mở lại popup vẫn đúng. Sir: chạy `018_calendar_series.sql` trên Supabase rồi thử khi đăng nhập.
