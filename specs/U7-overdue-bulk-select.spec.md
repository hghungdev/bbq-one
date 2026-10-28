# U7 — Hộp thoại "Sự kiện đã qua hạn": chọn hàng loạt

> **Failing test:** `specs/U7-overdue-bulk-select.test.mjs` — chạy thật `utils/bulkSelection.ts` +
> kiểm cấu trúc `CalendarOverdueReminderDialog.vue`. Thiết kế: `specs/ROADMAP-U.md` mục U7.
> **Yêu cầu (Sir, 2026-10-28):** thêm "chọn tất cả" thay vì bấm từng checkbox, hoặc giải pháp UI hiện
> đại hơn.

## Sửa

- `utils/bulkSelection.ts` (thuần):
  - `selectionState(ids, selected)` → `'none' | 'some' | 'all'` (`ids` rỗng → `'none'`).
  - `toggleMany(ids, selected)` → Set mới: đủ hết thì bỏ chọn các `ids`, không thì chọn hết; giữ nguyên
    mục ngoài `ids`.
  - `selectRange(ordered, anchorId, targetId, checked, selected)` → Set mới: đặt `checked` cho mọi mục
    từ anchor tới target (hai chiều); anchor không còn trong danh sách → chỉ target.
- `CalendarOverdueReminderDialog.vue`:
  - Thanh chọn: checkbox "Chọn tất cả" (`indeterminate` khi chọn một phần) + "Đã chọn n/N".
  - Tiêu đề ngày có checkbox chọn cả ngày (`indeterminate` tương tự) + số mục.
  - Cả hàng là `<label>` (bấm đâu cũng chọn); Shift + bấm → `selectRange` từ mục bấm trước.
  - Ctrl/⌘+A trong hộp thoại → chọn / bỏ chọn tất cả. Mở hộp thoại → focus "Chọn tất cả".
  - Nút chính "ĐÁNH DẤU XONG (n)" — `disabled` khi n = 0. "ĐỂ SAU" / ✕ / Esc như cũ.
  - Không chọn sẵn mục nào.
- i18n: `calendar.overdue.selectAll`, `selectedCount`, `selectDay`, `btnConfirmCount`, `tip`; gỡ
  `calendar.overdue.btnConfirm` (thay bằng bản có số).

## KHÔNG đổi

- `calendarOverdueReminder.service.ts` (lọc / nhóm / ẩn trong phiên), `markEventsDone`, điều kiện hiện
  hộp thoại trong `App.vue`.

## Nghiệm thu

1. Test GREEN; trên `6c1cbbe` RED. Mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Verify tay (cần vài sự kiện quá hạn chưa xong, đã đăng nhập):
   - Mở popup → hộp thoại; bấm "Chọn tất cả" → mọi mục được chọn, nút "ĐÁNH DẤU XONG (5)".
   - Bỏ một mục → "Chọn tất cả" chuyển gạch ngang; bấm checkbox một ngày → chọn / bỏ cả ngày đó.
   - Bấm mục 1, Shift + bấm mục 4 → chọn 1–4. Ctrl+A → chọn / bỏ hết.
   - Xác nhận → các mục đã chọn hiện gạch ngang (xong) trên lịch.
