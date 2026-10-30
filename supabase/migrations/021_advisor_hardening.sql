-- SEC-19: dọn cảnh báo Supabase Security Advisor (2026-10-30: 0 lỗi, 9 cảnh báo).
--
-- 1) "Function Search Path Mutable" ×5 — ghim search_path cho 5 hàm trigger. Thân hàm KHÔNG đổi: chỉ dùng to_tsvector /
--    coalesce / now (pg_catalog, luôn được tìm) + bảng notes (public); không dùng tiện ích schema extensions.
-- 2) "Public / Signed-In Users Can Execute SECURITY DEFINER Function" — bbq_trim_bookmark_backups() là hàm TRIGGER (giữ 20
--    bản sao lưu bookmark mới nhất). Thu hồi quyền gọi thẳng qua REST; trigger vẫn tự chạy khi INSERT.
-- Giữ nguyên (đã chấp nhận): bbq_mfa_aal_ok() — policy 2FA (019) cần authenticated gọi được, chỉ trả true / false về chính
-- người gọi (SEC-18); "Leaked Password Protection" — tính năng gói Pro.
--
-- Chạy lại an toàn. NÊN chạy khối "Tự kiểm" ở cuối trước (trong giao dịch, rollback).

alter function public.retronote_update_updated_at() set search_path = public;
alter function public.notes_set_fts() set search_path = public;
alter function public.note_bodies_set_fts() set search_path = public;
alter function public.note_bodies_touch_parent_note() set search_path = public;
alter function public.user_dictionary_set_fts() set search_path = public;

revoke all on function public.bbq_trim_bookmark_backups() from public, anon, authenticated;

-- ─── Tự kiểm (chạy TRƯỚC phần trên; trong giao dịch → rollback, không để lại gì) ────────────────────────────────────
-- Thay YOUR_EMAIL. Phải ra một dòng "OK — triggers chạy bình thường"; lỗi thì DỪNG (chưa có gì thay đổi).
--
-- begin;
--   alter function public.retronote_update_updated_at() set search_path = public;
--   alter function public.notes_set_fts() set search_path = public;
--   alter function public.note_bodies_set_fts() set search_path = public;
--   alter function public.note_bodies_touch_parent_note() set search_path = public;
--   alter function public.user_dictionary_set_fts() set search_path = public;
--   revoke all on function public.bbq_trim_bookmark_backups() from public, anon, authenticated;
--   select set_config('request.jwt.claims', json_build_object(
--     'sub', (select id from auth.users where email = 'YOUR_EMAIL'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
--   set local role authenticated;
--   insert into public.folders (id, user_id, name, position)
--     values ('00000000-0000-4000-8000-0000000f0021', (select auth.uid()), 'advisor-test', 0);
--   insert into public.notes (id, user_id, folder_id, title)
--     values ('00000000-0000-4000-8000-0000000a0021', (select auth.uid()), '00000000-0000-4000-8000-0000000f0021', 'hello');
--   insert into public.note_bodies (id, user_id, note_id, content)
--     values ('00000000-0000-4000-8000-0000000b0021', (select auth.uid()), '00000000-0000-4000-8000-0000000a0021', '<p>x</p>');
--   update public.note_bodies set content = '<p>y</p>' where id = '00000000-0000-4000-8000-0000000b0021';
--   insert into public.bookmark_backups (user_id, label, tree_json) values ((select auth.uid()), 'advisor-test', '[]');
--   select 'OK — triggers chạy bình thường' as ket_qua;
-- rollback;
--
-- Gỡ (quay lui phần 1; phần 2 cấp lại bằng grant execute … to authenticated nếu thật sự cần):
--   alter function public.retronote_update_updated_at() reset search_path;
--   alter function public.notes_set_fts() reset search_path;
--   alter function public.note_bodies_set_fts() reset search_path;
--   alter function public.note_bodies_touch_parent_note() reset search_path;
--   alter function public.user_dictionary_set_fts() reset search_path;
