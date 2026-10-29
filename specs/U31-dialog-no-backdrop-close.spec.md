# U31 — Hộp thoại không đóng khi bấm ra ngoài; chỉ đóng bằng ✕ (hoặc nút Hủy / Đóng) và Esc

> **Failing test:** `specs/U31-dialog-no-backdrop-close.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29):** "Khi mở popup mình đang nhập title chẳng hạn nhưng lỡ click chuột ra khỏi popup đó
> nhưng vẫn trong extension thì popup tắt đi, làm mình phải nhập lại data — có cách nào disable click khi mở popup
> không, chỉ được tắt 1 - là click X, 2 - là ESC".

## Hiện trạng

15 hộp thoại có lớp nền mờ; bấm lên nền (ngoài hộp) = đóng hộp, chữ đang gõ mất:

| Hộp | Bấm nền |
|---|---|
| `CalendarEventModal` (hộp ngày + form Thêm / Sửa sự kiện) | `@click.self="onBackdropClick"` → `store.closeModal()` |
| `CalendarOverdueReminderDialog` | `onBackdropClick` → `onClose()` |
| `QuickCreateModal` (tạo / đổi tên thư mục, ghi chú) · `MoveNoteModal` | `onBackdropClick` (trừ khi đang lưu) |
| `DeleteFolderModal` · `DeleteBackupModal` | `onBackdropClick` (trừ khi đang xóa) |
| `RetroConfirm` (mọi hộp xác nhận) | `@click.self="dismiss"` |
| `LoginModal` · `SecureFolderModal` · `AccountUnlockModal` · `AccountEncryptionSetupModal` | `@click.self` → đóng |
| `SettingsModal` | `.settings-backdrop @click` → đóng |
| `SyncConflictDialog` · `ConflictBackupsDialog` · `CalendarOverflowResolverDialog` | `@click.self` → hủy / đóng |

Mọi hộp đã có Esc (U29) và một nút đóng nhìn thấy được (✕, hoặc Hủy / Đóng ở hộp không có ✕).

## Sửa

1. Bỏ đóng-khi-bấm-nền ở cả 15 hộp: xóa `@click.self` / `@click` trên lớp nền và các hàm `onBackdropClick` không
   còn dùng. Bấm nền: không gì xảy ra (hộp đứng yên, chữ còn nguyên).
2. Lớp nền **chặn `mousedown`** (`@mousedown.self.prevent`; nền tách riêng của Cài đặt: `@mousedown.prevent`): bấm
   nền không kéo focus ra khỏi hộp — con trỏ vẫn ở ô đang gõ. Nếu để focus rơi về `<body>` (đo trên Chromium khi
   chỉ bỏ `@click.self`): Esc của hộp nghe trên panel (tạo thư mục, chuyển ghi chú…) thôi chạy, và Esc của hộp xác
   nhận (C12 chặn lan trên panel) lọt xuống đóng luôn hộp ngày bên dưới.
3. Đóng hộp chỉ còn: **✕** (hoặc nút Hủy / Đóng của hộp) và **Esc** — giữ nguyên như hiện tại, gồm cả điều kiện
   "đang lưu / đang xóa thì Esc không đóng".
4. Chốt chặn cho hộp sau này: không phần tử nào có class `…backdrop…` / `…overlay…` được gắn `@click` /
   `@pointerdown` / `@mousedown="…"` (trình xử lý có hàm); `@mousedown(.self).prevent` trơn được phép.

## KHÔNG được đổi

Menu / bảng nổi (menu ⚙ ở dòng, menu chuột phải thư mục, menu tài khoản, bảng chip lịch) vẫn đóng khi bấm ra
ngoài — đó là menu, không có chữ đang gõ. Bấm ra ngoài **cửa sổ extension** vẫn đóng extension (Chrome). Esc chỉ
đóng lớp trong cùng (U29).

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium: form Thêm sự kiện gõ tên → bấm nền → hộp còn,
chữ còn, gõ tiếp được; ✕ đóng; mở lại → Esc đóng. Hộp tạo thư mục: bấm nền → Esc vẫn đóng. Hộp xác nhận xóa: bấm nền
→ Esc chỉ đóng hộp xác nhận, hộp ngày còn (C12). Cài đặt: bấm nền không đóng.
