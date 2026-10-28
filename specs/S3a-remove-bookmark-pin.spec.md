# S3a — Gỡ hẳn Bookmark PIN (hướng 1: không ai có bản sao lưu mã hóa)

> **Failing test:** `specs/S3a-remove-bookmark-pin.test.mjs` — code thật `bookmarks.service.ts` với
> Supabase giả + kiểm cấu trúc.
> **Quyết định (Sir, 2026-10-28):** bỏ PIN — mỗi user tự chịu trách nhiệm bảo mật tài khoản; mã hóa
> đầu-cuối đã có "Encrypted account".
> **Số liệu thật (Sir chạy trên Supabase):** `bookmark_crypto` = **1** tài khoản; `bookmark_backups
> where encrypted` = **0** bản / 0 tài khoản → **không có dữ liệu nào cần chuyển**.

## Lý do (ngoài "thừa")

- PIN 6–9 số + PBKDF2 120k: nếu DB lộ, salt + verifier trong `bookmark_crypto` cho phép thử hết tổ hợp
  offline — ước tính vài chục giây (6 số) tới vài giờ (9 số) với một GPU mạnh. Passphrase của
  Encrypted account (PBKDF2 600k, ≥ 10 ký tự) mạnh hơn nhiều bậc.
- Lỗi ngầm: đã đặt PIN mà chưa mở khóa trong phiên → **tự động sao lưu bookmark bị bỏ qua, không báo**
  (`bookmarkAutoBackup.service.ts`).

## Sửa

- Xóa: `stores/bookmarkPin.ts`, `utils/bookmarkCrypto.ts`, `utils/bookmarkSessionKey.ts`,
  `utils/bookmarkPinValidation.ts`, `services/bookmarkCryptoKeys.service.ts`,
  `components/bookmarks/BookmarkPinModal.vue`, `components/bookmarks/PinKeypad.vue`.
- `bookmarks.service`: `saveBackup` luôn lưu thường; `listBackups` bỏ qua row `encrypted` (không đọc
  được nữa — hiện có 0 row; không hiện cây rỗng để tránh "khôi phục" ra trình duyệt trống); gỡ
  `decryptAllEncryptedToPlaintext` / `reencryptAllEncryptedBackups`.
- `bookmarkAutoBackup.service`: bỏ kiểm tra PIN → luôn sao lưu khi cây đổi.
- `BookmarkTab`: bỏ cổng PIN — mở tab là nạp dữ liệu.
- `SettingsModal`: bỏ mục "Bookmark PIN"; `auth.ts`: bỏ khóa PIN khi logout / mất session.
- i18n: gỡ `pin.*`, `settings.bookmarkPin*`, `settings.pin*`.
- Migration `supabase/migrations/016_drop_bookmark_crypto.sql`: `DROP TABLE bookmark_crypto` — chạy
  **sau khi** mọi máy đã cập nhật bản mới (bản cũ còn đọc bảng này). Giữ cột `encrypted` / `payload_*`
  của `bookmark_backups` (không còn dữ liệu, vô hại; dọn sau).
- Giữ `stripEncryptedBackupTrees` (N8) — vô hại khi không còn row mã hóa.
- Bookmark được mã hóa bằng khóa của Encrypted account: vẫn là việc của S3 (ROADMAP-S).

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Tab Bookmark mở thẳng (không hỏi PIN); Settings không còn mục Bookmark PIN; thêm một bookmark → vài
   giây sau có bản "auto_backup_…".
3. Sau khi cập nhật mọi máy: chạy `016_drop_bookmark_crypto.sql` trong Supabase SQL Editor.
