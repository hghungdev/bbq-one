# U29 — Esc không đóng extension; chỉ đóng lớp trong cùng

> **Failing test:** `specs/U29-esc-keeps-popup.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29):** "Khi mở extension mình bấm ESC bị tự động tắt đi … khi nào click chuột ra ngoài
> extension thì mới tự động đóng lại" — "ví dụ mở add event lên mà Esc thì đóng popup add event đi chứ không đóng
> extension".

## Hiện trạng (đo trên Chromium thật — mở popup bằng `chrome.action.openPopup()`, gửi phím qua DevTools Protocol)

| Trường hợp | Kết quả |
|---|---|
| A. Màn hình chính (không lớp nào mở), nhấn Esc | **popup đóng** |
| B. Trang gọi `preventDefault()` cho Esc | popup **vẫn mở** |
| C / D. Hộp sự kiện / form Thêm sự kiện (con trỏ trong ô tiêu đề) | hộp đóng, popup vẫn mở |

Chrome chỉ đóng popup khi phím Esc **không được trang xử lý**. Các hộp thoại đã `preventDefault` nên đúng ý; còn ở màn
hình chính (và ở 4 lớp chưa nghe Esc dưới đây) Esc rơi xuống Chrome → đóng cả extension.

Lớp chưa nghe Esc: menu ⚙ ở dòng thư mục / ghi chú (`ListItemSettingsMenu`), `SyncConflictDialog`,
`ConflictBackupsDialog`, `CalendarOverflowResolverDialog`.

## Sửa

1. **`main.ts`**: một listener `keydown` trên `window` pha **capture** — `Escape` (không đang gõ IME,
   `!e.isComposing`) → `preventDefault()`. Không `stopPropagation` → hộp thoại / ô tìm / menu vẫn nhận Esc như cũ
   (không chỗ nào trong code dựa vào `defaultPrevented`). Capture để chạy trước cả những lớp `stopPropagation`.
2. 4 lớp trên: Esc = đúng hành động khi bấm ra ngoài — menu ⚙ đóng + trả focus về nút ⚙; `SyncConflictDialog` →
   `resolve('cancel')`; `ConflictBackupsDialog` → `close`; `CalendarOverflowResolverDialog` → `cancel`. Chỉ khi đang
   hiện; gỡ listener khi đóng / unmount.
3. Chốt chặn: mọi component lớp phủ (`role="dialog" | "alertdialog" | "menu"`, `aria-modal`, `bbqone-overlay`) phải
   xử lý Esc.

## KHÔNG được đổi

Esc của từng hộp thoại (C12 hộp xác nhận chỉ đóng chính nó, C14 hộp Đăng nhập, U2/U5 ô tìm xóa + thu gọn, U6 chip
lịch…); bấm ra ngoài popup vẫn đóng extension (hành vi của Chrome).

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium (popup thật): A → popup **vẫn mở**; form Thêm
sự kiện → Esc đóng form, popup còn; menu ⚙ → Esc đóng menu, popup còn.
