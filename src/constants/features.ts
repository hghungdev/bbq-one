/**
 * Cờ tính năng — tạm tắt phần chưa sẵn sàng phát hành mà KHÔNG gỡ code (bật lại = đổi một dòng).
 */
export const FEATURES = {
  /**
   * S3b (Sir, 2026-10-28): tạm ẩn "Mã hóa tài khoản" trong Settings — S3 hoãn, Sir nghiên cứu thêm
   * (specs/ROADMAP-S.md). Tài khoản đã bật vẫn được hỏi mở khóa như cũ.
   */
  accountEncryptionSettings: false,
} as const
