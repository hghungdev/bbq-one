-- SEC-13 (2.3.1): đổi khóa thư mục bảo mật NGUYÊN TỬ — Nâng cấp / Đổi mật khẩu / Bật bảo mật.
-- Trước: client ghi TỪNG ghi chú rồi mới ghi salt thư mục → mạng rớt giữa chừng = ghi chú mang bản mã của salt không được
-- lưu → mất vĩnh viễn. Giờ client tính sẵn mọi bản mã rồi gọi hàm này MỘT lần: cả thư mục + ghi chú + section đổi trong
-- một giao dịch — hoặc xong hết, hoặc không đổi gì.
--
-- SECURITY INVOKER: RLS "own rows" + policy aal2 (019) vẫn áp như mọi lệnh khác. Không đọc schema auth.
-- Chạy lại an toàn (create or replace). Kiểm bằng khối "Tự kiểm" ở cuối (trong giao dịch, rollback — không để lại gì).

create or replace function public.bbq_rekey_secure_folder(
  p_folder_id uuid,
  p_expected_salt text,
  p_salt text,
  p_iterations integer,
  p_verifier text,
  p_notes jsonb,   -- [{ "id": uuid, "title": text }]      — MỌI ghi chú của thư mục
  p_bodies jsonb   -- [{ "id": uuid, "label": text, "content": text }] — MỌI section của các ghi chú đó
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_folder public.folders;
  v_missing integer;
  v_notes jsonb;
  v_bodies jsonb;
begin
  if p_iterations < 100000 or p_iterations > 5000000 then
    raise exception 'BBQ_REKEY_BAD_ITERATIONS: %', p_iterations using errcode = 'P0001';
  end if;
  if p_salt is null or p_verifier is null then
    raise exception 'BBQ_REKEY_BAD_INPUT' using errcode = 'P0001';
  end if;

  -- Khóa dòng thư mục: hai máy cùng đổi khóa → máy sau chờ, rồi thấy salt đã đổi → từ chối bên dưới.
  select * into v_folder
  from public.folders
  where id = p_folder_id and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'BBQ_REKEY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_folder.secure_salt is distinct from p_expected_salt then
    raise exception 'BBQ_REKEY_STALE: folder salt changed elsewhere' using errcode = 'P0001';
  end if;

  -- Không mã hóa sót: mọi ghi chú / section hiện có của thư mục phải nằm trong payload (vd ghi chú vừa tạo ở máy khác).
  select count(*) into v_missing
  from public.notes n
  where n.folder_id = p_folder_id
    and n.user_id = (select auth.uid())
    and not exists (select 1 from jsonb_array_elements(p_notes) x where (x ->> 'id')::uuid = n.id);
  if v_missing > 0 then
    raise exception 'BBQ_REKEY_INCOMPLETE: % note(s) missing', v_missing using errcode = 'P0001';
  end if;
  select count(*) into v_missing
  from public.note_bodies b
  join public.notes n on n.id = b.note_id
  where n.folder_id = p_folder_id
    and b.user_id = (select auth.uid())
    and not exists (select 1 from jsonb_array_elements(p_bodies) x where (x ->> 'id')::uuid = b.id);
  if v_missing > 0 then
    raise exception 'BBQ_REKEY_INCOMPLETE: % note body(ies) missing', v_missing using errcode = 'P0001';
  end if;

  -- synced_at = now() cùng giao dịch với trigger updated_at = now() → dòng "sạch", client không đẩy lại.
  update public.notes n
  set title = x.title, synced_at = now()
  from jsonb_to_recordset(p_notes) as x(id uuid, title text)
  where n.id = x.id and n.folder_id = p_folder_id and n.user_id = (select auth.uid());

  update public.note_bodies b
  set label = x.label, content = x.content, synced_at = now()
  from jsonb_to_recordset(p_bodies) as x(id uuid, label text, content text)
  where b.id = x.id
    and b.user_id = (select auth.uid())
    and b.note_id in (select n.id from public.notes n where n.folder_id = p_folder_id);

  update public.folders
  set is_secure = true,
      secure_salt = p_salt,
      pbkdf2_iterations = p_iterations,
      secure_verifier_enc = p_verifier
  where id = p_folder_id
  returning * into v_folder;

  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'updated_at', n.updated_at, 'synced_at', n.synced_at)), '[]'::jsonb)
  into v_notes
  from public.notes n
  where n.folder_id = p_folder_id and n.user_id = (select auth.uid());

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'updated_at', b.updated_at, 'synced_at', b.synced_at)), '[]'::jsonb)
  into v_bodies
  from public.note_bodies b
  join public.notes n on n.id = b.note_id
  where n.folder_id = p_folder_id and b.user_id = (select auth.uid());

  return jsonb_build_object('folder', to_jsonb(v_folder), 'notes', v_notes, 'bodies', v_bodies);
end;
$$;

-- Supabase cấp sẵn EXECUTE cho anon / authenticated với hàm mới trong public → thu hồi rồi cấp lại đúng.
revoke all on function public.bbq_rekey_secure_folder(uuid, text, text, integer, text, jsonb, jsonb) from public;
revoke all on function public.bbq_rekey_secure_folder(uuid, text, text, integer, text, jsonb, jsonb) from anon;
grant execute on function public.bbq_rekey_secure_folder(uuid, text, text, integer, text, jsonb, jsonb) to authenticated;

-- ─── Tự kiểm (chạy SAU khi tạo hàm; trong giao dịch → rollback, KHÔNG để lại dữ liệu) ────────────────────────────────
-- Thay YOUR_EMAIL bằng email tài khoản BBQOne. Trình soạn SQL dừng ở lỗi đầu tiên → chạy A và B THÀNH HAI LẦN riêng.
--
-- A) Đủ ghi chú → phải trả một dòng jsonb có "is_secure": true, "pbkdf2_iterations": 600000:
-- begin;
--   select set_config('request.jwt.claims', json_build_object(
--     'sub', (select id from auth.users where email = 'YOUR_EMAIL'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
--   set local role authenticated;
--   insert into public.folders (id, user_id, name, position, is_secure)
--     values ('00000000-0000-4000-8000-0000000f0013', (select auth.uid()), 'rekey-selftest', 0, false);
--   insert into public.notes (id, user_id, folder_id, title)
--     values ('00000000-0000-4000-8000-0000000a0013', (select auth.uid()), '00000000-0000-4000-8000-0000000f0013', 'plain');
--   select public.bbq_rekey_secure_folder('00000000-0000-4000-8000-0000000f0013', null, 'c2FsdA==', 600000, 'v',
--     '[{"id":"00000000-0000-4000-8000-0000000a0013","title":"env"}]', '[]');
-- rollback;
--
-- B) Thiếu ghi chú → phải BÁO LỖI "BBQ_REKEY_INCOMPLETE: 1 note(s) missing" (đúng như mong đợi; giao dịch tự hủy):
-- begin;
--   (3 dòng set_config / set local role / 2 lệnh insert như A)
--   select public.bbq_rekey_secure_folder('00000000-0000-4000-8000-0000000f0013', null, 'c2FsdA==', 600000, 'v', '[]', '[]');
-- rollback;
--
-- Gỡ: drop function if exists public.bbq_rekey_secure_folder(uuid, text, text, integer, text, jsonb, jsonb);
