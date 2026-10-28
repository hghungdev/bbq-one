-- S3a: gỡ hẳn Bookmark PIN — bảng metadata PIN (salt + verifier, tạo ở supabase/006_bookmark_pin_crypto.sql)
-- không còn client nào đọc/ghi.
--
-- CHỈ CHẠY SAU KHI mọi máy đã cập nhật bản extension mới: bản cũ vẫn đọc bảng này khi mở tab Bookmark.
-- Chạy trong Supabase SQL Editor sau 015_user_crypto.sql.
--
-- Trước khi chạy, kiểm lại không còn bản sao lưu mã hóa bằng PIN (lúc gỡ: 0 bản):
--   SELECT count(*) FROM bookmark_backups WHERE encrypted;
--
-- Giữ cột encrypted / payload_iv / payload_ciphertext của bookmark_backups: không còn dữ liệu, vô hại;
-- S3 (mã hóa bookmark bằng khóa Encrypted account) sẽ quyết định dùng lại hay dọn.

DROP TABLE IF EXISTS public.bookmark_crypto;
