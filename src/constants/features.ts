/**
 * Cờ tính năng — tạm tắt phần chưa sẵn sàng phát hành mà KHÔNG gỡ code (bật lại = đổi một dòng).
 */
export const FEATURES = {
  /**
   * S3b (Sir, 2026-10-28): tạm ẩn "Mã hóa tài khoản" trong Settings — S3 hoãn, Sir nghiên cứu thêm
   * (specs/ROADMAP-S.md). Tài khoản đã bật vẫn được hỏi mở khóa như cũ.
   */
  accountEncryptionSettings: false,
  /**
   * B1 (Sir, 2026-10-29): người ĐÃ đăng nhập cũng thấy Cài đặt › Sao lưu với CHỈ nút "Sao lưu ngay" (đọc cache của
   * tài khoản — không tự động, không khôi phục). Code sẵn, tạm tắt — cần thì đổi thành true.
   */
  backupFileSignedIn: false,
} as const
