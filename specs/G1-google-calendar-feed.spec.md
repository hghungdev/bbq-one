# G1 — Link Google Calendar (đồng bộ MỘT chiều BBQOne → Google), mỗi user một link riêng trong Settings

> **Failing test:** `specs/G1-google-calendar-feed.test.mjs` — code thật `buildIcs` / `handleFeedRequest`
> (Edge Function, chạy trong Node với dữ liệu giả) + token / URL + kiểm cấu trúc migration / Settings.
> **Quyết định (Sir, 2026-10-28):** làm giai đoạn 1; link nằm trong **Settings**, **mỗi user một link khác
> nhau**; Lịch **không** mã hóa đầu-cuối (ROADMAP-S "Quyết định phạm vi mã hóa").
> Nghiên cứu: Google "Thêm lịch → Từ URL" là đăng ký iCal **chỉ đọc**; Google tự tải lại theo chu kỳ riêng
> (không công bố — quan sát vài giờ đến ~24 giờ), không ép làm mới được; URL phải là HTTPS công khai.

## Luồng

```
Settings › Google Calendar
  (chưa có link)  [ Tạo link ]
  (đã có link)    https://<project>.supabase.co/functions/v1/calendar-feed/<token>.ics   [⧉]
                  1. Google Calendar → Cài đặt → Thêm lịch → Từ URL
                  2. Dán link → Thêm lịch
                  ⚠ KHÔNG tick "Make the calendar publicly accessible".
                  Google cập nhật sau vài giờ – 1 ngày; chỉ một chiều (sửa trong BBQOne).
                  [⟳ Tạo link mới]  [Tắt link] / [Bật link]
```

Google Calendar tải `GET …/calendar-feed/<token>.ics` → Edge Function tìm user theo token (service role),
đọc sự kiện của user đó (−90 → +400 ngày) → trả `text/calendar` (RFC 5545).

## Thiết kế

- **Bảng `calendar_feeds`** (`supabase/migrations/017_calendar_feeds.sql`): `user_id` PK → auth.users,
  `token` UNIQUE, `enabled`, `created_at`, `last_fetched_at`; RLS chủ sở hữu (user chỉ đọc / ghi dòng của mình).
  Token lưu dạng chữ thường (không băm): nó chỉ mở được lịch — dữ liệu vốn đã nằm dạng chữ thường trong cùng DB
  với cùng RLS; lưu thường để mọi máy của user đều thấy lại đúng link (băm thì máy khác phải tạo link mới →
  link trong Google chết).
- **Token**: 32 byte ngẫu nhiên (`crypto.getRandomValues`) → base64url 43 ký tự. "Tạo link mới" = token mới
  (link cũ 404 ngay). "Tắt link" = `enabled = false` (404, giữ token để bật lại).
- **Edge Function `calendar-feed`** (`supabase/functions/calendar-feed/`):
  - `ics.ts` — `buildIcs(events, opts)` thuần: `VCALENDAR` / `VEVENT`, `UID:<id>@bbqone`, cả ngày
    `DTSTART;VALUE=DATE` + `DTEND` = ngày hôm sau (DTEND không tính), có giờ + `?tz=` hợp lệ →
    `DTSTART;TZID=…`; `SUMMARY` có "✓ " khi đã xong; `DESCRIPTION`; escape `\ ; , xuống dòng`; gập dòng
    ≤ 75 byte UTF-8 (tiếng Việt nhiều byte); CRLF; `X-WR-CALNAME:BBQOne`; `TRANSP:TRANSPARENT` (không chiếm
    "bận").
  - `handler.ts` — `handleFeedRequest(req, deps)` thuần (deps tiêm vào: tìm feed, liệt kê sự kiện, ghi
    `last_fetched_at`, giờ hiện tại): chỉ GET / HEAD; token sai định dạng / không có / đã tắt → **404 giống
    nhau** (không lộ link nào tồn tại); `Content-Type: text/calendar; charset=utf-8`.
  - `index.ts` — `Deno.serve` + `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (biến có sẵn trong
    Edge Function). Triển khai **không kiểm JWT** (Google không có): `supabase functions deploy calendar-feed
    --no-verify-jwt`.
- **Client**: `utils/calendarFeed.ts` (token, URL, kiểm định dạng), `services/calendarFeed.service.ts`
  (đọc / tạo / tạo mới / bật-tắt qua `calendar_feeds`), mục **Google Calendar** trong Settings (chỉ khi đã đăng
  nhập), sao chép ⧉, "Tạo link mới" hỏi xác nhận (link cũ trong Google sẽ ngừng).

## Bảo mật

- Link = mật khẩu đọc lịch: ai có link đọc được lịch. Không đưa vào log client; Settings ghi rõ cảnh báo.
- Không tick "Make the calendar publicly accessible" trong Google (nếu tick, lịch thành công khai trên Google).
- Service role chỉ nằm trong Edge Function (biến môi trường của Supabase), không bao giờ ở extension.
- Supabase lưu log đường dẫn request (có token) — chấp nhận được; có "Tạo link mới" khi nghi lộ.

## Việc của Sir (một lần)

1. SQL Editor: chạy `supabase/migrations/017_calendar_feeds.sql`.
2. Supabase CLI: `supabase functions deploy calendar-feed --no-verify-jwt --project-ref <ref>`.
3. Mở Settings › Google Calendar → Tạo link → dán vào Google.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. File `.ics` mẫu từ `buildIcs` hợp lệ RFC 5545 (gập dòng, escape, CRLF).
3. Chromium (session giả): Settings có mục Google Calendar; chưa đăng nhập thì không hiện.
4. Sau khi Sir deploy: dán link vào Google Calendar → sự kiện hiện (trong vài giờ).
