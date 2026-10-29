# Module: BaaS — Supabase / Firebase (client nói thẳng với database)

Với BaaS, **client gọi thẳng database** bằng khóa công khai → mọi phân quyền nằm ở **RLS (Supabase)** / **Security
Rules (Firebase)**. Một bảng quên policy = ai cũng đọc / sửa được. Đây là chỗ đáng soi nhất.

## Supabase

1. **RLS từng bảng**: mọi bảng ở schema `public` (và schema expose khác) phải `ENABLE ROW LEVEL SECURITY` + policy cho
   cả đọc (`USING`) và ghi (`WITH CHECK`). Đối chiếu số `create table` với số `enable row level security` trong
   `supabase/migrations/*.sql` (và file SQL rời). Bảng tạo bằng dashboard không có trong repo → **người dùng kiểm** ở
   Table Editor / Advisors.
   ```bash
   grep -hiE "create table|enable row level security|create policy" supabase/**/*.sql supabase/*.sql 2>/dev/null | sed -E 's/\s+/ /g' | head -80
   ```
2. **Policy đúng chủ**: `auth.uid() = user_id` (không `true`, không chỉ `auth.role() = 'authenticated'` — mọi người đăng
   nhập đều đọc được của nhau). `WITH CHECK` chặn đổi `user_id` sang người khác.
3. **Hàm SQL**: `SECURITY DEFINER` bỏ qua RLS → phải `SET search_path` + tự kiểm `auth.uid()`; hàm ở `public` gọi được
   qua `/rpc/` bởi `anon` nếu chưa `REVOKE EXECUTE … FROM anon, public`. Ưu tiên `SECURITY INVOKER`.
4. **Khóa**: `anon` công khai theo thiết kế; **`service_role` không bao giờ ở client / repo** (chỉ Edge Function / server).
5. **Edge Functions**: `--no-verify-jwt` thì tự xác thực thế nào (token ngẫu nhiên ≥ 128 bit, so sánh hằng thời gian)?
   CORS; kiểm tham số; lỗi không lộ chi tiết; dùng service role thì lọc theo chủ ở code.
6. **Storage**: bucket `public: true`? Policy `storage.objects` theo `auth.uid()` + đường dẫn (`(storage.foldername(name))[1]
   = auth.uid()::text`)?
7. **Auth (dashboard — repo không thấy, người dùng kiểm)**: độ dài mật khẩu tối thiểu, chặn mật khẩu lộ, rate limit,
   xác nhận email, secure email change, Redirect URLs không `*`, MFA. Có 2FA thì RLS phải bắt
   `(auth.jwt()->>'aal') = 'aal2'` cho người đã đăng ký factor (policy `as restrictive`), không thì gọi thẳng API bằng
   phiên `aal1` là qua.
8. **Realtime**: kênh broadcast / presence có kiểm quyền? Bảng bật realtime vẫn theo RLS.
9. **PostgREST**: bộ lọc dựng bằng chuỗi (`.or(\`title.ilike.%${q}%\`)`) → chèn thêm điều kiện lọc; escape dấu `,` `.`
   `(` `)` hoặc dùng `.ilike()` riêng.

## Firebase

1. `firestore.rules` / `database.rules.json` / `storage.rules`: tìm `allow read, write: if true`, `if request.auth !=
   null` (mọi người đăng nhập), rule cho phép ghi trường `role`; kiểm `request.resource.data` (kiểu, độ dài, trường cho
   phép); rule mặc định hết hạn (`request.time < timestamp.date(…)`).
2. Cloud Functions dùng Admin SDK (bỏ qua rules) → tự kiểm `context.auth`; callable function kiểm App Check?
3. Web API key công khai theo thiết kế — nhưng giới hạn API được phép trong Google Cloud Console.
4. Auth: email enumeration protection, chống tạo tài khoản hàng loạt, MFA.

## PoC (chỉ trên project dev / local — `supabase start` hoặc Firebase emulator)

Tạo 2 người dùng thử A, B; đăng nhập B bằng client JS / `curl` với `apikey` + `Authorization: Bearer <token B>` →
đọc / sửa / xóa dòng của A từng bảng; gọi từng `/rpc/<hàm>` bằng `anon`. Kỳ vọng: 0 dòng / 401 / 403.
