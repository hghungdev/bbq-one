# R8 — Phát hành 2.3.1 (vá SEC-13)

> **Failing test:** `specs/R8-release-2.3.1.test.mjs`. Gồm SEC-13 (`specs/SEC13-atomic-rekey.spec.md`).

## Việc

- manifest / package / lock / `DESIGN.md` = **2.3.1**; quyền không đổi.
- README `**Version:** 2.3.1` + "What changed in 2.3.1" (mục lục, trước 2.3.0): đổi / nâng cấp / bật bảo mật thư mục giờ
  nguyên tử — mất mạng giữa chừng không mất ghi chú; cần migration `020_secure_folder_rekey.sql`.
- Store: **WHAT'S NEW IN 2.3.1** — dòng sửa thư mục bảo mật đứng đầu, giữ dòng 2FA + các dòng cũ. Listing "Release 2.3.1
  (highlights)". Permissions `**v2.3.1**`.
- `SECURITY.md` (mục S9): đổi khóa nguyên tử (SEC-13, migration 020). Báo cáo `SEC-REDTEAM-2026-10-30.md`: SEC-13 → `✅ 2.3.1`.

## Đổi assertion có chủ đích

`R7.1–R7.4`: phiên bản **hiện tại ≥ 2.3.0** theo manifest; lịch sử 2.3.0 kiểm như cũ.

## Thứ tự (Sir)

1. SQL Editor: chạy `supabase/migrations/020_secure_folder_rekey.sql` → khối tự kiểm A (phải ra jsonb `is_secure: true`) và B
   (phải báo `BBQ_REKEY_INCOMPLETE`) — cả hai trong giao dịch, `rollback`.
2. Upload **2.3.1** lên Store (thay cho 2.3.0).
