# calendar-feed — link Google Calendar (G1)

Edge Function phục vụ `GET /functions/v1/calendar-feed/<token>.ics` cho Google Calendar ("Thêm lịch → Từ URL").
Đồng bộ **một chiều** BBQOne → Google; Google tự tải lại theo chu kỳ riêng (vài giờ – ~1 ngày).
Thiết kế + lý do: `specs/G1-google-calendar-feed.spec.md`.

| File | Vai trò |
|---|---|
| `ics.ts` | dựng iCalendar RFC 5545 (thuần, có test trong `specs/G1-google-calendar-feed.test.mjs`) |
| `handler.ts` | kiểm token, 404 / 405, cửa sổ −90 → +400 ngày (thuần, có test) |
| `index.ts` | nối Supabase (service role do Supabase cấp cho Edge Function) + `Deno.serve` |

## Triển khai (một lần)

1. **Bảng** — Supabase Dashboard → SQL Editor → chạy `supabase/migrations/017_calendar_feeds.sql`.
2. **Supabase CLI** (nếu chưa có): <https://supabase.com/docs/guides/cli> → `supabase login`.
3. **Deploy** (từ thư mục gốc repo):

   ```bash
   supabase functions deploy calendar-feed --no-verify-jwt --project-ref <project-ref>
   ```

   `--no-verify-jwt` là **bắt buộc**: Google Calendar tải link không đăng nhập — token trong đường dẫn là cửa
   duy nhất. Không cần đặt secret: `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` có sẵn trong Edge Function.
4. **Kiểm tra** — extension → Settings → Google Calendar → Tạo link → sao chép, rồi:

   ```bash
   curl -i "<link vừa sao chép>"           # 200, Content-Type: text/calendar
   curl -i "https://<ref>.supabase.co/functions/v1/calendar-feed/sai.ics"   # 404
   ```

5. Google Calendar → Cài đặt → Thêm lịch → **Từ URL** → dán link → **Thêm lịch**.
   **Không** tick "Make the calendar publicly accessible". Sự kiện hiện sau một lúc (Google quyết định).

## Bảo mật

- Link = mật khẩu đọc lịch. Nghi lộ → Settings → **Tạo link mới** (link cũ 404 ngay) rồi dán lại vào Google.
- Service role chỉ nằm trong Edge Function; extension chỉ dùng anon key + RLS (`calendar_feeds_owner`).
- Log request của Supabase có đường dẫn (chứa token) — chỉ người quản trị project xem được.
