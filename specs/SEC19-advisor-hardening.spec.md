# SEC-19 — Dọn cảnh báo Supabase Security Advisor (Thấp)

> **Failing test:** `specs/SEC19-advisor-hardening.test.mjs`. **Sir (2026-10-30):** chạy Security Advisor → 0 lỗi, 9 cảnh
> báo; "Yes, add 021" (ghi các lệnh sửa thành migration trong repo).

## Cảnh báo và xử lý

| Cảnh báo | Thực thể | Xử lý |
|---|---|---|
| Function Search Path Mutable (×5) | `retronote_update_updated_at`, `notes_set_fts`, `note_bodies_set_fts`, `note_bodies_touch_parent_note`, `user_dictionary_set_fts` | `alter function … set search_path = public` — thân hàm chỉ dùng `to_tsvector` / `coalesce` / `now` (pg_catalog) + bảng `notes` (public), không có tiện ích schema `extensions` → không đổi hành vi |
| Public / Signed-In Can Execute SECURITY DEFINER (×2) | `bbq_trim_bookmark_backups()` | `revoke all … from public, anon, authenticated` — là hàm trigger (giữ 20 bản sao lưu bookmark mới nhất); trigger vẫn chạy khi INSERT, chỉ chặn gọi thẳng qua REST |
| Signed-In Can Execute SECURITY DEFINER | `bbq_mfa_aal_ok()` | **Giữ** — policy 2FA (019) cần `authenticated` gọi được; chỉ trả true / false về chính người gọi (SEC-18) |
| Leaked Password Protection Disabled | Auth | Tính năng gói Pro — chấp nhận ở gói miễn phí |

## File

`supabase/migrations/021_advisor_hardening.sql`: phần chạy (5 `alter function`, 1 `revoke`) + chú thích: khối tự kiểm trong
giao dịch (ghim search_path, thu hồi, rồi INSERT / UPDATE ghi chú, section, bản sao lưu bookmark dưới vai `authenticated` →
`rollback`) và khối gỡ (`reset search_path`).

## Test

| Ca | Kiểm |
|---|---|
| SEC19.1 | Đủ 5 `alter function public.<tên>() set search_path = public;`, không `create or replace` (không đổi thân) |
| SEC19.2 | `revoke all on function public.bbq_trim_bookmark_backups() from public, anon, authenticated;` |
| SEC19.3 | Không đụng `bbq_mfa_aal_ok`, phần chạy không đọc schema `auth` |
| SEC19.4 | Có khối tự kiểm `begin; … rollback;` (note_bodies + bookmark_backups) + khối gỡ |

## KHÔNG được đổi

Thân các hàm, policy RLS / 2FA, quyền của `bbq_mfa_aal_ok`, `bbq_rekey_secure_folder`, `bbq_update_*_if_current`.

## Nghiệm thu

Sir chạy khối tự kiểm → "OK"; chạy phần chính; sửa ghi chú + "Sao lưu ngay" bookmark bình thường; Rerun linter → còn 2 cảnh
báo đã chấp nhận (`bbq_mfa_aal_ok`, Leaked password).
