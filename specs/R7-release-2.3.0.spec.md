# R7 — Phát hành 2.3.0 (xác thực 2 bước)

> **Failing test:** `specs/R7-release-2.3.0.test.mjs`. Gồm S2 (`specs/S2-mfa-totp.spec.md`).

## Việc

- manifest / package / lock / `DESIGN.md` = **2.3.0**; quyền không đổi.
- README `**Version:** 2.3.0` + "What changed in 2.3.0" (mục lục, trước 2.2.0): 2FA tùy chọn, ứng dụng xác thực, bước nhập
  mã, chặn ở máy chủ (`019_mfa_enforce.sql`), thứ tự bật.
- Store: **WHAT'S NEW IN 2.3.0** — dòng 2FA đứng đầu, giữ các dòng 2.2.0 / 2.1.x. Listing "Release 2.3.0 (highlights)".
  Permissions doc `**v2.3.0**`.
- `SECURITY.md`: mục "Xác thực 2 bước (S2, 2.3.0)" — RLS aal2, migration 019, thứ tự triển khai, mất điện thoại.

## Đổi assertion có chủ đích

`R6.1–R6.4`: phiên bản **hiện tại ≥ 2.2.0** theo manifest; lịch sử 2.2.0 kiểm như cũ.

## Thứ tự triển khai (Sir)

1. Supabase dashboard › Authentication › Multi-Factor › **TOTP: bật** (A3).
2. Upload 2.3.0, **mọi máy lên 2.3.0**.
3. SQL Editor: chạy `supabase/migrations/019_mfa_enforce.sql` → kiểm bằng truy vấn cuối file.
4. Cài đặt › Xác thực 2 bước › Bật (lưu chuỗi bí mật vào trình quản lý mật khẩu).
