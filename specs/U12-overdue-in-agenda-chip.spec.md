# U12 — Nhóm thông báo thứ hai: "Quá hạn" vào chip (bỏ hộp thoại tự bật)

> **Failing test:** `specs/U12-overdue-in-agenda-chip.test.mjs` — chạy thật `utils/calendarAgenda.ts`
> + kiểm cấu trúc chip / `App.vue`. Thiết kế chung: `specs/U11-popover-design-language.spec.md`
> (câu hỏi 2). **Sir chốt (2026-10-28):** nhóm A (Quá hạn); chỉ ở trong chip, không tự bật hộp thoại.

## Hiện trạng

Sự kiện đã qua chưa xong → `CalendarOverdueReminderDialog` **tự bật** đè màn hình mỗi phiên (chỉ khi
đã đăng nhập), "Để sau" ẩn đến hết phiên.

## Sửa

```
[● Hôm nay  HSBC T1279, OT…  · ● 5 quá hạn ▾]     (chỉ có quá hạn: [● Quá hạn  5 việc chưa xong ▾])
  ↑ chip tối đa MỘT đoạn phụ: quá hạn thay cho "Mai n" (ngày mai vẫn đủ trong bảng)
┌ Upcoming ──────────────────────────────────────┐
│ ● QUÁ HẠN · 5 việc chưa xong    Đánh dấu xong  │  → mở hộp thoại chọn hàng loạt (U7)
│   Shinhan · 20/10                              │  → bấm: mở lịch đúng ngày
│   Claude · 20/10                               │
│   SPLayer · 26/10                              │
│   và 2 việc khác                               │  → mở hộp thoại
│ ● HÔM NAY · 28/10                    Mở lịch   │
│ ● NGÀY MAI · 29/10                   Mở lịch   │
└────────────────────────────────────────────────┘
```

- `utils/calendarAgenda.ts`: `buildAgenda(..., overdue = [])` → `agenda.overdue = { count, items (3 đầu,
  kèm dateKey) } | null`; `agendaChip`: có quá hạn mà không có hôm nay / ngày mai → `tone: 'overdue'`;
  ngược lại thêm `overdueCount`. Không có gì cả → `null` như cũ.
- `CalendarAgendaChip`: lấy quá hạn từ `listOverdueIncompleteEvents(calendar.events)` (tự cập nhật khi
  đánh dấu xong / tải lại); mục "QUÁ HẠN" đứng đầu bảng, chấm màu đỏ; "Đánh dấu xong" và "và n việc
  khác" → emit `review-overdue`.
- `App.vue`: bỏ `maybeShowOverdueReminder` (3 chỗ gọi) + cờ "đã ẩn trong phiên"; `@review-overdue` mở
  hộp thoại; đóng / xác nhận chỉ ẩn hộp thoại (chip vẫn đếm phần còn lại).
- `calendarOverdueReminder.service`: gỡ `isOverdueReminderDismissed` / `dismissOverdueReminder` /
  `clearOverdueReminderDismiss` (+ lời gọi trong `auth.ts`, hằng số session key) — không còn ai dùng.
- Chip hiện cả ở local mode (trước: hộp thoại chỉ khi đăng nhập) — quá hạn không phụ thuộc cloud.
- i18n: `calendar.agenda.overdue`, `overdueCount`, `overdueShort`, `overdueMore`, `reviewOverdue`.

## Đổi assertion test cũ (có chủ đích — theo quyết định của Sir)

- **C7a** "`refreshStoresFromNetwork().then(maybeShowOverdueReminder)`" và **C7b** "watch(isAuthenticated)
  re-check reminder": mục đích là nhắc quá hạn dựa trên dữ liệu mới nhất, kể cả khi đăng nhập muộn. Chip
  là `computed` theo `calendar.events` nên tự cập nhật sau mỗi lần tải / đăng nhập → đổi thành "không
  còn tự bật hộp thoại; chip đọc quá hạn từ store".
- **U10.2** regex "`buildAgenda(…, null)`": `null` không còn là tham số cuối (thêm danh sách quá hạn
  phía sau) → chỉ đòi `null` ở vị trí "ngày mai đã ẩn".

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Có sự kiện quá hạn → mở popup **không** còn hộp thoại tự bật; chip có "· 5 quá hạn"; bảng có mục
   QUÁ HẠN; "Đánh dấu xong" mở hộp thoại; xác nhận → số quá hạn giảm ngay.
