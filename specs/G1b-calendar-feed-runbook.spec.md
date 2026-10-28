# G1b — Sổ tay làm lại link Google Calendar (đổi project / server / DB)

> **Failing test:** `specs/G1b-calendar-feed-runbook.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** "Note lại cách hướng này giúp mình — sau này nếu có thể mình sẽ đổi server hoặc DB
> khác thì có cách làm lại."
> **Bối cảnh:** G1 đã chạy thật trên Supabase ngày 2026-10-28 — Sir deploy bằng **Dashboard › Edge Functions › Via
> Editor** (dán 1 file gộp), rồi tắt **"Verify JWT with legacy secret"** ở tab Settings của function.

## Sửa

1. **`scripts/bundle-calendar-feed.mjs`** + `npm run calendar-feed:bundle` — gộp `ics.ts` + `handler.ts` + `index.ts`
   thành **một file** để dán vào Dashboard (cách đã làm). Bỏ import tương đối, đưa import ngoài (`npm:…`) lên đầu,
   báo lỗi nếu gặp import nhiều dòng (không đoán). Mặc định ghi `out/calendar-feed.dashboard.ts`; nhận đường dẫn
   khác qua tham số. `out/` vào `.gitignore` (file sinh ra — sửa 3 file nguồn rồi chạy lại, không sửa tay).
2. **`supabase/functions/calendar-feed/README.md`** thành sổ tay đầy đủ:
   - Sơ đồ chạy + phần nào phụ thuộc Supabase (chỉ `index.ts`).
   - Cần gì trên DB (bảng + cột function đọc) và biến môi trường.
   - **A. Triển khai trên Supabase** — A1 Dashboard (đúng các bước Sir đã làm), A2 CLI (`--no-verify-jwt`,
     `--use-api` không cần Docker, cách tìm `<project-ref>`). Cách cập nhật code về sau.
   - **Kiểm tra** — link giả → `Not found`; link thật → `BEGIN:VCALENDAR`; Google "Từ URL"; `last_fetched_at`.
   - **Lỗi thường gặp** — 401 (Verify JWT còn bật), 404 function không tồn tại, 404 link tắt / đã tạo mới, 500,
     Google chậm, giờ lệch.
   - **B. Chuyển sang project Supabase mới** — DB, dữ liệu (user_id đổi → không chép `calendar_feeds`), deploy,
     `.env` + build, **link cũ chết** → mỗi user tạo link mới và thêm lại vào Google.
   - **C. Chuyển sang server / DB khác** — giữ `ics.ts` + `handler.ts`; viết lại `index.ts` qua 4 hàm
     `findFeed` / `listEvents` / `touch` / `now` (kèm SQL tương đương + kiểu dữ liệu phải trả); đổi
     `buildFeedUrl` ở `src/utils/calendarFeed.ts`; nhắc phần đồng bộ / đăng nhập của extension cũng dựa Supabase
     và privacy policy phải sửa theo.
   - Không ghi project ref thật (repo công khai) — chỉ `<project-ref>`.
3. `specs/ROADMAP-U.md`: ghi G1 đã chạy thật + G1b.

## Nghiệm thu

1. Test GREEN — gồm chạy thử **file gộp** (Supabase / Deno giả): token sai → 404, token đúng → 200 `text/calendar`,
   ghi `last_fetched_at`; mọi harness khác PASS.
2. File gộp sinh từ code hiện tại kiểm kiểu sạch (`tsc --strict`, khai báo `Deno` giả).
