-- S2 (2.3.0): xác thực 2 bước — chặn ở MÁY CHỦ.
-- Tài khoản ĐÃ có factor MFA "verified" → chỉ phiên aal2 (đã nhập mã) mới đọc / ghi được dữ liệu của mình.
-- Không có factor → aal1 vẫn được (2FA là TÙY CHỌN). Thiếu policy này thì kẻ có mật khẩu gọi thẳng REST API bằng phiên
-- aal1 là qua, màn hình nhập mã trong extension vô nghĩa.
--
-- S2.16 (sửa 2026-10-30): bản đầu đọc THẲNG auth.mfa_factors trong policy → role `authenticated` không có quyền SELECT
-- bảng đó → MỌI truy vấn của người đã đăng nhập lỗi "permission denied for table mfa_factors". Giờ kiểm qua hàm
-- SECURITY DEFINER (chạy bằng quyền chủ hàm, search_path rỗng, chỉ trả true / false về CHÍNH người gọi).
--
-- Policy RESTRICTIVE (AND với các policy permissive "own rows" sẵn có) cho MỌI bảng public có cột user_id — duyệt
-- information_schema nên không sót bảng (folders, notes, note_bodies, bookmark_backups, calendar_events, calendar_feeds,
-- user_crypto, … và bảng cũ nếu còn). FOR ALL + chỉ USING → Postgres dùng USING làm WITH CHECK cho INSERT / UPDATE.
-- RPC bbq_update_*_if_current là SECURITY INVOKER → áp luôn. Edge Function calendar-feed dùng service role → không đổi.
--
-- THỨ TỰ (xem specs/S2-mfa-totp.spec.md): bật TOTP ở dashboard → mọi máy lên BBQOne 2.3.0 → chạy file này → mới bật
-- 2FA trong Cài đặt. Tài khoản chưa bật 2FA không bị ảnh hưởng. Chạy lại an toàn (create or replace / drop if exists).

-- 1) Hàm kiểm: phiên hiện tại đủ mức chưa? true khi JWT aal2, hoặc user không có factor nào đã xác minh.
create or replace function public.bbq_mfa_aal_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      )
$$;

-- Supabase cấp sẵn EXECUTE cho anon / authenticated với hàm mới trong public (default privileges) → thu hồi rồi cấp lại đúng.
revoke all on function public.bbq_mfa_aal_ok() from public;
revoke all on function public.bbq_mfa_aal_ok() from anon;
grant execute on function public.bbq_mfa_aal_ok() to authenticated;

-- 2) Policy trên mọi bảng public có user_id — chỉ gọi hàm, không đọc bảng auth.
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop policy if exists "mfa_aal2_if_enrolled" on public.%I', t);
    execute format($p$
      create policy "mfa_aal2_if_enrolled" on public.%I
        as restrictive
        for all
        to authenticated
        using ((select public.bbq_mfa_aal_ok()))
    $p$, t);
    raise notice 'mfa_aal2_if_enrolled → public.%', t;
  end loop;
end $$;

-- Kiểm (chạy sau, trong SQL Editor):
--   select public.bbq_mfa_aal_ok();
--   → true (KHÔNG được lỗi quyền; lỗi thì chạy khối "Gỡ" bên dưới ngay).
--   select tablename, policyname, permissive from pg_policies where policyname = 'mfa_aal2_if_enrolled' order by 1;
--   → mỗi bảng có user_id một dòng, permissive = 'RESTRICTIVE'.
--   Rồi mở popup BBQOne đã đăng nhập → ghi chú / lịch phải tải bình thường.
--
-- Gỡ (quay lui):
--   do $$ declare t text; begin
--     for t in select tablename from pg_policies where schemaname = 'public' and policyname = 'mfa_aal2_if_enrolled' loop
--       execute format('drop policy "mfa_aal2_if_enrolled" on public.%I', t);
--     end loop; end $$;
--   drop function if exists public.bbq_mfa_aal_ok();
