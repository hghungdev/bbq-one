# calendar-feed — link Google Calendar (G1) · sổ tay triển khai / làm lại

Edge Function phục vụ `GET /functions/v1/calendar-feed/<token>.ics?tz=<IANA>` cho Google Calendar ("Lịch khác ＋ →
Từ URL"). Đồng bộ **một chiều** BBQOne → Google; Google tự tải lại theo chu kỳ riêng (vài giờ – ~1 ngày).
Thiết kế + lý do: `specs/G1-google-calendar-feed.spec.md`. Sổ tay này: `specs/G1b-calendar-feed-runbook.spec.md`.

> Đã chạy thật ngày 2026-10-28 bằng cách **A1 (Dashboard)**. Repo công khai — đừng ghi project ref / key thật vào
> đây, chỉ `<project-ref>`.

## Cách chạy

```
Extension (đã đăng nhập — anon key + RLS)
  Settings › Google Calendar › Tạo link
    → ghi calendar_feeds (user_id, token 43 ký tự ngẫu nhiên, enabled)
    → hiện link <VITE_SUPABASE_URL>/functions/v1/calendar-feed/<token>.ics?tz=<múi giờ máy>
                                                         (buildFeedUrl — src/utils/calendarFeed.ts)
Google Calendar (KHÔNG đăng nhập) ── GET link ──▶ Edge Function calendar-feed (service role)
    → calendar_feeds: token → user_id (phải enabled)        sai / tắt / không có → cùng một 404
    → calendar_events của user đó, từ −90 đến +400 ngày
    → trả file .ics (text/calendar), ghi calendar_feeds.last_fetched_at
```

| File | Vai trò | Dính Supabase? |
|---|---|---|
| `ics.ts` | dựng iCalendar RFC 5545 (thuần, có test trong `specs/G1-google-calendar-feed.test.mjs`) | Không |
| `handler.ts` | đọc token ở đoạn cuối đường dẫn, 404 / 405, cửa sổ ngày (thuần, có test) — DB tiêm qua 4 hàm | Không |
| `index.ts` | nối Supabase (service role) + `Deno.serve` | **Có — phần duy nhất phải viết lại khi đổi server** |

**Cần trên DB:**
- `calendar_events` (`supabase/migrations/012` → `014`) — function đọc các cột `user_id, id, title, description,
  event_date, start_time, end_time, is_done, updated_at, position`.
- `calendar_feeds` (`supabase/migrations/017_calendar_feeds.sql`).

**Biến môi trường của function:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase **tự cấp** cho mọi Edge
Function, không cần đặt secret. Service role chỉ nằm trên server, **không bao giờ** vào extension / `.env`.

## A. Triển khai trên Supabase

### A1. Dashboard (không cần terminal) — cách đã làm

1. **Bảng** (nếu chưa có): Dashboard → **SQL Editor** → dán + Run `supabase/migrations/017_calendar_feeds.sql`.
2. **Tạo file gộp** (máy có repo + Node): `npm run calendar-feed:bundle` → `out/calendar-feed.dashboard.ts`
   (= `ics.ts` + `handler.ts` + `index.ts` trong một file; `out/` không commit — file sinh ra, đừng sửa tay).
3. Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor** → xóa code mẫu trong `index.ts`, dán
   **toàn bộ** file gộp (kiểm tra đã dán đến dòng cuối `)` của `Deno.serve`).
4. **Function name:** `calendar-feed` (đúng chữ — link trong extension dựa vào tên này) → **Deploy function**.
5. Mở function → tab **Settings** → **Verify JWT with legacy secret** → gạt **TẮT** → **Save changes**.
   Bắt buộc: Google tải link không gửi `Authorization`. (Dashboard đổi giao diện thì tìm mục có chữ "Verify JWT".)
6. **Kiểm tra** (mục dưới).

**Cập nhật code về sau:** sửa 3 file nguồn (chạy lại test G1) → `npm run calendar-feed:bundle` → function → tab
**Code** → dán đè → Deploy (hoặc dùng A2). Sau đó xem lại tab Settings: "Verify JWT" vẫn phải TẮT.

### A2. CLI (máy có Node — không cần Docker)

Chạy ở **thư mục gốc repo** (CLI đọc `supabase/functions/calendar-feed/`, không cần file gộp):

```bash
npx supabase login                      # mở trình duyệt để đăng nhập Supabase
npx supabase functions deploy calendar-feed --no-verify-jwt --use-api --project-ref <project-ref>
```

- `<project-ref>`: phần đầu của `VITE_SUPABASE_URL` (`https://<project-ref>.supabase.co`), hoặc Dashboard → Project
  Settings → General → **Reference ID**.
- `--no-verify-jwt` = bước 5 của A1 (tắt Verify JWT). `--use-api`: deploy qua API, không cần Docker.

## Kiểm tra

1. **Link giả** — mở trên trình duyệt:
   `https://<project-ref>.supabase.co/functions/v1/calendar-feed/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.ics`
   (43 chữ `A`) → thấy `Not found` (404) = function chạy đúng, chỉ từ chối token giả.
2. **Link thật** — extension → Settings → Google Calendar → **Tạo link** → ⧉ sao chép → mở trên trình duyệt → tải về
   `.ics` / thấy `BEGIN:VCALENDAR`. Hoặc: `curl -i "<link>"` → `200`, `content-type: text/calendar`.
3. **Google** — calendar.google.com → **Lịch khác ＋** → **Từ URL** → dán link → **Thêm lịch**. **Không** tick
   "công khai". Hiện lịch tên **BBQOne**; sự kiện đã xong có "✓ " ở đầu tên.
4. **Google đã tải chưa?** Dashboard → Table Editor → `calendar_feeds` → cột `last_fetched_at` có giờ; hoặc tab
   **Logs** của function.

## Lỗi thường gặp

| Thấy | Nguyên nhân | Sửa |
|---|---|---|
| `401` · `Missing authorization header` / `Invalid JWT` | "Verify JWT" còn bật | A1 bước 5 / deploy lại với `--no-verify-jwt` |
| `404` · `Requested function was not found` | sai tên function hoặc chưa deploy | đặt tên đúng `calendar-feed` |
| `404` · `Not found` với link thật | link đã tắt, đã "Tạo link mới", hoặc chép thiếu ký tự | Settings → Bật link / dùng link mới nhất |
| `500` | thiếu bảng / cột (chưa chạy migration) | tab Logs; chạy `012` → `014`, `017` |
| Google không hiện / hiện bản cũ | Google chưa tải lại (vài giờ – ~1 ngày, Google quyết định) | chờ; link phải là https công khai (localhost không được) |
| Sự kiện có giờ bị lệch | link thiếu `?tz=` (chép tay) | lấy link từ extension (tự gắn múi giờ máy) |

## B. Chuyển sang project Supabase mới

(đổi tài khoản / org / region — vẫn dùng Supabase)

1. **DB mới:** dựng lại toàn bộ schema của BBQOne trên project mới (các file SQL trong `supabase/`, migrations chạy
   theo số thứ tự). Tối thiểu cho tính năng này: `calendar_events` (`012` → `014`) và `calendar_feeds` (`017`).
2. **Dữ liệu (tùy):** chuyển `auth.users` + `calendar_events`. **Đừng chép `calendar_feeds`:** nếu user đăng ký lại
   thì `user_id` đổi → dòng cũ sai chủ; và link cũ đằng nào cũng chết (bước 5). Để mỗi user tạo link mới.
3. **Function:** làm lại **A1** (hoặc A2 với `<project-ref>` mới) — nhớ tắt "Verify JWT".
4. **Extension:** `.env` → `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` của project mới → `npm run build` →
   Reload / phát hành bản mới. Manifest **không** đổi: quyền `https://*.supabase.co/*` đã bao mọi project Supabase.
5. **Link cũ chết** (URL chứa tên project cũ): mỗi user vào Settings → Google Calendar → **Tạo link**, rồi trong
   Google Calendar gỡ lịch BBQOne cũ (Cài đặt → chọn lịch → Hủy đăng ký) và thêm lại **Từ URL** bằng link mới.

## C. Chuyển sang server / DB khác

(không dùng Supabase Edge Function — vd Node / Bun / Deno Deploy / Cloudflare Workers + Postgres / MySQL…)

1. **Giữ nguyên `ics.ts` + `handler.ts`** — TypeScript thuần, chỉ dùng `Request` / `Response` chuẩn web. Token lấy ở
   **đoạn cuối** đường dẫn (`…/<token>.ics`), nên route nào cũng được, vd `GET /calendar-feed/:file`.
2. **Viết lại `index.ts`:** nhận request, gọi `handleFeedRequest(req, deps)` với 4 hàm:

   | Hàm | SQL tương đương (Postgres) |
   |---|---|
   | `findFeed(token)` | `SELECT user_id, enabled FROM calendar_feeds WHERE token = $1` → 1 dòng hoặc `null` |
   | `listEvents(userId, from, to)` | `SELECT id, title, description, event_date, start_time, end_time, is_done, updated_at FROM calendar_events WHERE user_id = $1 AND event_date BETWEEN $2 AND $3 ORDER BY event_date, position` |
   | `touch(userId)` | `UPDATE calendar_feeds SET last_fetched_at = now() WHERE user_id = $1` |
   | `now()` | `new Date()` |

   **Kiểu phải trả** (`FeedEvent` trong `ics.ts`) — nhiều driver trả `Date` thay vì chuỗi, phải đổi:
   `event_date` = `'YYYY-MM-DD'` · `start_time` / `end_time` = `'HH:MM'` / `'HH:MM:SS'` hoặc `null` ·
   `updated_at` = ISO 8601 (`.toISOString()`) hoặc `null` · `is_done` = boolean.
3. **Quyền & bảo mật:** endpoint **không** đòi đăng nhập (token trong link là cửa duy nhất). Tài khoản DB của
   server đọc được 2 bảng của **mọi** user (tương đương service role) → chỉ để trên server. HTTPS công khai bắt buộc.
4. **Extension:** `buildFeedUrl` trong `src/utils/calendarFeed.ts` đang ghép
   `<VITE_SUPABASE_URL>/functions/v1/calendar-feed/` → đổi sang địa chỉ server mới (vd thêm biến môi trường riêng),
   sửa test G1 tương ứng. Extension không tự gọi link này nên không cần thêm quyền host cho nó.
5. **Lưu ý lớn hơn:** đăng nhập, đồng bộ ghi chú / lịch và việc tạo link (`calendar_feeds`) của extension đều dùng
   Supabase (`src/services/*`). Bỏ hẳn Supabase = viết lại lớp đó (ngoài phạm vi tính năng này), và sửa
   `docs/privacy-policy.html` (đang ghi Supabase là nơi lưu dữ liệu).
6. Như B.5: link đổi → mỗi user tạo link mới và thêm lại vào Google.

## Bảo mật

- Link = mật khẩu đọc lịch. Nghi lộ → Settings → **Tạo link mới** (link cũ 404 ngay) rồi dán lại vào Google.
- Service role chỉ nằm trong Edge Function; extension chỉ dùng anon key + RLS (`calendar_feeds_owner`).
- Log request của Supabase có đường dẫn (chứa token) — chỉ người quản trị project xem được.
