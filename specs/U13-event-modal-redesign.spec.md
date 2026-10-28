# U13 — Hộp thoại sự kiện (danh sách ngày + Sự kiện mới / Sửa) theo "ADN popover"

> **Failing test:** `specs/U13-event-modal-redesign.test.mjs` — code thật `compactDateList`
> (`utils/calendarRecurrence.ts`) + kiểm cấu trúc template / CSS.
> Giao diện kiểm bằng ảnh chụp Chromium (extension thật), light + dark.
> **Yêu cầu (Sir, 2026-10-28):** "Layout UI popup này xấu quá" — ảnh hộp thoại **New event** (đang chọn
> Weekly). Làm trên nhánh `claude/ui-adn-redesign`.

## Vì sao xấu (đọc từ ảnh)

| Chỗ | Vấn đề |
|---|---|
| Title / Repeat | mỗi trường là một **hộp viền** nằm trong hộp thoại — hộp lồng hộp (U11 đã bỏ ở mọi chỗ khác) |
| Repeat | `<select>` gốc của trình duyệt: danh sách thả xuống kiểu hệ điều hành, lệch hẳn phong cách app; phải bấm 2 lần mới thấy lựa chọn |
| Occurrences | ô số gốc + nhãn nằm ngang hàng với select, xuống dòng lộn xộn khi hẹp; mũi tên ▲▼ nhỏ khó bấm |
| Xem trước | một câu dài "Creates 6 events: Nov 3, Nov 10, …" bị **cắt / xuống dòng giữa ngày**, khó đọc; ngày bị bỏ qua (đã đủ 3 sự kiện) không chỉ ra là ngày nào |
| Chân hộp thoại | Cancel / Save nằm trong một **viên thuốc có viền** — thêm một hộp nữa |
| Danh sách ngày | "＋ Add event" là một hộp to; dòng sự kiện có nền + viền riêng; vạch màu sự kiện không hiện (CSS scoped đè) |

## Thiết kế mới

```
┌──────────────────────────────────────────────┐
│ Sự kiện mới                               ✕  │  tiêu đề đậm + ✕ trong suốt
│ Thứ Ba, 3 tháng 11, 2026                     │  ngày: chữ phụ mờ
│                                              │
│ TIÊU ĐỀ                              12/64   │  nhãn IN HOA nhỏ + bộ đếm
│ ┌──────────────────────────────────────────┐ │  ô phẳng nền xám nhạt, không viền;
│ │ HSBC T1279                               │ │  focus = nền tấm + vòng nhấn (giống ô tìm)
│ └──────────────────────────────────────────┘ │
│ LẶP LẠI                                      │
│ ( Một lần | Hằng tuần | Hằng tháng | Hằng năm )  segmented control (radiogroup, ← → đổi)
│                                              │
│ SỐ LẦN   ( − │ 6 │ + )   đến 8 tháng 12, 2026 │  bước nhảy; − / + mờ khi chạm 2 / trần
│                                              │
│ SẼ TẠO · 6 sự kiện                           │
│ [3/11] [10/11] [17/11] [24/11] [1/12] [8/12] │  chip ngày, tự xuống dòng nguyên chip
│ ⚠ 1 ngày đã đủ 3 sự kiện — sẽ bỏ qua.        │  chip ngày đó gạch ngang, màu đỏ
│                                              │
│                     Hủy   [ Tạo 6 sự kiện ]  │  nút chữ + nút chính đặc (không khung)
└──────────────────────────────────────────────┘
```

- **Sửa sự kiện:** như trên nhưng không có Lặp lại; chân có thêm "Xóa" (nút chữ đỏ) bên trái.
- **Danh sách ngày:** tiêu đề = ngày đủ thứ ("Thứ Ba, 3 tháng 11, 2026"); `SectionHeader`
  "SỰ KIỆN · 1/3" + nút chữ "＋ Thêm sự kiện" (bỏ hộp "Add event"); dòng phẳng `ds-row` có vạch màu
  3 px của sự kiện (như bảng Lịch sắp tới), 🗑 chỉ hiện khi rê chuột / focus. Ngày đã qua / đủ: một dòng
  chữ phụ, không hộp.
- **Xem trước nhiều ngày:** tối đa 8 chip; dài hơn → 6 chip đầu, chip "+n", chip ngày cuối
  (`compactDateList`). Chip ngày bị bỏ qua: gạch ngang + màu đỏ + tooltip.
- **Nút chính:** "Lưu" khi không lặp / khi sửa; "Tạo n sự kiện" khi lặp (n = số ngày thực sự tạo —
  đã trừ ngày đủ).
- **Bàn phím:** mở form → focus vào ô tiêu đề; Enter = lưu; ← → / Home / End trong nhóm Lặp lại; Esc
  đóng (như cũ).
- Bề mặt hộp thoại: `--bg-panel`, bo 16 px, bóng mềm (bỏ nền gradient), giống bảng Lịch sắp tới.

## Sửa

- `utils/calendarRecurrence.ts`: `compactDateList(dates, max = 8)` → `{ shown, hidden, last }`.
- `CalendarEventModal.vue`: template + CSS như trên. Không đổi logic lưu (`createEvent`,
  `createRecurringEvents`, `updateEvent`), giới hạn (`RECURRENCE_*`, `CALENDAR_*`), chặn ngày đã qua / đủ.
- `assets/styles/calendar-events.css`: bỏ khối `.cal-modal__row.cal-event-tone-*` (vạch màu vẽ bằng
  phần tử con, không còn tranh chấp với CSS scoped).
- i18n vi + en: thêm `calendar.modal.section.events`, `calendar.repeat.previewCount`,
  `calendar.repeat.until`, `calendar.repeat.saveN`, `calendar.repeat.decrease`,
  `calendar.repeat.increase`, `calendar.repeat.skipChip`, `calendar.repeat.moreDates`; đổi chữ
  `calendar.repeat.none` → "Một lần" / "Once" (vừa một ô của segmented control),
  `calendar.repeat.preview` → "Sẽ tạo" / "Will create" (nhãn mục; số lượng ở `previewCount`); gỡ
  `calendar.modal.title.list` (tiêu đề danh sách giờ là chính ngày).

## KHÔNG đổi

U3 W1–W4 (lặp chỉ khi tạo mới; xem trước bằng `recurrenceDates`; lưu bằng `createRecurringEvents`; đủ
khóa i18n). Hành vi lưu / xóa / hoàn tác / chặn ngày đã qua.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Ảnh Chromium light + dark: danh sách ngày, Sự kiện mới (Một lần / Hằng tuần có ngày bị bỏ qua /
   Hằng tháng 24 lần → chip "+n"), Sửa sự kiện. Không lỗi console.
3. Bàn phím: mở form → gõ ngay được tiêu đề; ← → đổi tần suất; − / + dừng ở 2 và trần.
