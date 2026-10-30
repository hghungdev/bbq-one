-- S2 (2.3.0): xác thực 2 bước — chặn ở MÁY CHỦ.
-- Tài khoản ĐÃ có factor MFA "verified" → chỉ phiên aal2 (đã nhập mã) mới đọc / ghi được dữ liệu của mình.
-- Không có factor → aal1 vẫn được (2FA là TÙY CHỌN). Thiếu policy này thì kẻ có mật khẩu gọi thẳng REST API bằng phiên
-- aal1 là qua, màn hình nhập mã trong extension vô nghĩa.
--
-- Policy RESTRICTIVE (AND với các policy permissive "own rows" sẵn có) cho MỌI bảng public có cột user_id — duyệt
-- information_schema nên không sót bảng (folders, notes, note_bodies, bookmark_backups, calendar_events, calendar_feeds,
-- user_crypto, … và bảng cũ nếu còn). FOR ALL + chỉ USING → Postgres dùng USING làm WITH CHECK cho INSERT / UPDATE.
-- RPC bbq_update_*_if_current là SECURITY INVOKER → áp luôn. Edge Function calendar-feed dùng service role → không đổi.
--
-- THỨ TỰ (xem specs/S2-mfa-totp.spec.md): bật TOTP ở dashboard → mọi máy lên BBQOne 2.3.0 → chạy file này → mới bật
-- 2FA trong Cài đặt. Bản < 2.3.0 không có bước nhập mã → với tài khoản đã bật 2FA sẽ thấy 0 dòng (dữ liệu không mất).
-- Chạy lại an toàn (drop policy if exists).

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
        using (
          array[(select auth.jwt() ->> 'aal')] <@ (
            select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
            from auth.mfa_factors
            where (select auth.uid()) = user_id and status = 'verified'
          )
        )
    $p$, t);
    raise notice 'mfa_aal2_if_enrolled → public.%', t;
  end loop;
end $$;

-- Kiểm (chạy sau):
--   select tablename, policyname, permissive from pg_policies where policyname = 'mfa_aal2_if_enrolled' order by 1;
--   → mỗi bảng có user_id một dòng, permissive = 'RESTRICTIVE'.
-- Gỡ (quay lui):
--   do $$ declare t text; begin
--     for t in select tablename from pg_policies where schemaname = 'public' and policyname = 'mfa_aal2_if_enrolled' loop
--       execute format('drop policy "mfa_aal2_if_enrolled" on public.%I', t);
--     end loop; end $$;
