-- G1: link Google Calendar (iCal, một chiều BBQOne → Google) — mỗi user MỘT link bí mật.
-- Chạy trong Supabase SQL Editor sau 016_drop_bookmark_crypto.sql. Edge Function `calendar-feed`
-- (supabase/functions/calendar-feed) đọc bảng này bằng service role; client chỉ thấy dòng của chính mình (RLS).
--
-- token: 32 byte ngẫu nhiên base64url (43 ký tự), tạo ở client. Lưu dạng thường (không băm) để mọi máy
-- của user thấy lại đúng link — token chỉ mở được lịch, mà lịch vốn đã lưu dạng thường với cùng RLS
-- (quyết định "Lịch không mã hóa", specs/ROADMAP-S.md).

CREATE TABLE IF NOT EXISTS public.calendar_feeds (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{43}$'),
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_fetched_at  TIMESTAMPTZ
);

ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_feeds_owner" ON public.calendar_feeds;
CREATE POLICY "calendar_feeds_owner" ON public.calendar_feeds
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
