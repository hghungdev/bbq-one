# S3b — Tạm ẩn "Mã hóa tài khoản" khỏi Settings (S3 hoãn — Sir nghiên cứu thêm)

> **Failing test:** `specs/S3b-hide-account-encryption.test.mjs` (cấu trúc).
> **Quyết định (Sir, 2026-10-28):** "Tạm thời phần mã hóa note lại trước, ẩn đi ở Settings, ghi vào plan — mình
> sẽ research nghiên cứu thêm."

## Sửa

- Cờ tính năng `src/constants/features.ts` → `FEATURES.accountEncryptionSettings = false`.
- `SettingsModal`: mục "Mã hóa tài khoản" + hộp "Bật mã hóa tài khoản" chỉ hiện khi cờ bật → **ẩn**. Không gỡ
  code nào (S2C còn nguyên, bật lại = đổi một dòng).
- `specs/ROADMAP-S.md`: S3 (mã hóa tên thư mục + bản sao lưu Bookmark) và mục Settings ghi **tạm hoãn**, chờ Sir
  nghiên cứu; ghi lại phương án đã đề xuất (sao lưu tự động khi đang khóa → chờ trong máy, tải lên sau khi mở khóa).

## Không bị kẹt: tài khoản ĐÃ bật mã hóa

Ẩn chỉ chặn việc **bật mới** từ Settings. Tài khoản đã bật vẫn dùng được:
- App vẫn hỏi mở khóa khi mở (`refreshAccountCryptoStatus` → `unlockModalOpen`), bấm ghi chú bị khóa cũng mở
  hộp mở khóa (`NoteItem`), "Quên passphrase → Recovery key" nằm trong hộp mở khóa.
- Vẫn tự khóa sau 30 phút / khi đóng trình duyệt / khi đăng xuất. Chỉ mất nút "Khóa ngay" trong Settings.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium (đã đăng nhập): Settings chỉ còn Ngôn ngữ / Mật khẩu / Google Calendar.
