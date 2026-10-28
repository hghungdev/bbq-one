# U14 — Quá hạn: đánh dấu xong TỪNG việc ngay trong bảng "Lịch sắp tới"

> **Failing test:** `specs/U14-overdue-mark-one.test.mjs` — code thật `overduePanelRows`
> (`utils/calendarAgenda.ts`) + kiểm cấu trúc `CalendarAgendaChip.vue` + i18n.
> **Câu hỏi (Sir, 2026-10-28):** "overdue này mình có sẽ xử lý từng record không hay phải xử lý hết tất
> cả — vì có vài cái có thể chưa xong nên đánh tất cả thì hơi bất tiện".

## Hiện trạng

"Mark done" ở đầu mục QUÁ HẠN **không** đánh dấu hết: nó mở hộp thoại Quá hạn (U7), mở ra với **0 mục
được chọn**, user tick từng việc. Nhưng:

- chữ "Mark done" / "Đánh dấu xong" đọc như "đánh dấu tất cả" → gây hiểu nhầm;
- muốn xong **một** việc vẫn phải mở hộp thoại, tick, xác nhận — 3 bước cho việc nhỏ nhất.

## Thiết kế

```
● QUÁ HẠN · 4 việc chưa xong                     Xem tất cả
  ○ ▍ Shinhan                                         20/10    ← bấm ○ = xong việc này
  ◉ ▍ ~~Claude~~                                      20/10    ← đã xong: gạch ngang; bấm ◉ = hoàn tác
  ○ ▍ SPLayer                                         26/10
  và 2 việc khác                                               ← mở hộp thoại (U7)
```

- Mỗi dòng quá hạn có vòng tròn ✓ bên trái (nút bật/tắt, `aria-pressed`). Bấm → **chỉ việc đó** thành
  xong, lưu ngay (`markEventsDone([id])`); dòng **ở nguyên chỗ**, gạch ngang + vòng tròn đặc — bấm lại =
  hoàn tác (`toggleDone`). Không hẹn giờ, không toast: trạng thái lưu tức thì, đóng popup lúc nào cũng an
  toàn.
- Danh sách giữ nguyên trong lúc bảng mở (chụp id lúc mở → không nhảy dòng khi đánh dấu); đóng bảng rồi
  mở lại → chỉ còn việc chưa xong.
- Bấm tên việc: như cũ — mở lịch ngày đó.
- Đầu mục: số "n việc chưa xong" cập nhật ngay; nút "Đánh dấu xong" đổi tên **"Xem tất cả"** / "Review
  all" (mở hộp thoại tick nhiều — U7), ẩn khi không còn việc nào.
- "và n việc khác": n = số việc chưa xong ngoài các dòng đang hiện.

Không dùng undo-toast chung: nó gắn với hàng đợi **xóa** chờ commit của service worker (`pendingDeleteCommit`)
— dùng cho "xong" là sai nghĩa và có rủi ro.

## Sửa

- `utils/calendarAgenda.ts`: `overduePanelRows(ids, events)` → dòng theo đúng thứ tự `ids`, trạng thái
  xong lấy từ store, bỏ id đã bị xóa / tiêu đề rỗng.
- `CalendarAgendaChip.vue`: `overdueShownIds` (chụp khi mở bảng), nút ✓ từng dòng, đếm / "và n việc khác"
  theo số liệu sống.
- i18n vi + en: `calendar.agenda.reviewOverdue` → "Xem tất cả" / "Review all"; thêm
  `calendar.agenda.markOneDone`, `calendar.agenda.markOneUndo`.

## KHÔNG đổi

`buildAgenda` / `agendaChip` (U12.1–U12.4); hộp thoại Quá hạn (U7); App mở hộp thoại qua
`@review-overdue`.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium (session giả, offline, 5 việc quá hạn): bấm ○ dòng 2 → chỉ việc đó `is_done`, dòng gạch
   ngang tại chỗ, chip "4 quá hạn"; bấm lại → hoàn tác; đóng + mở bảng → dòng đã xong biến mất; "Xem tất
   cả" mở hộp thoại với 0 mục chọn. Light + dark, không lỗi console.
