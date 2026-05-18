-- Tighten calendar event title limit to 64 chars (aligned with CALENDAR_TITLE_MAX in app).
-- Shorten existing rows first so ADD CONSTRAINT succeeds where 012 allowed up to 200.
UPDATE calendar_events SET title = left(title, 64) WHERE char_length(title) > 64;

ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_title_check;

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_title_check CHECK (char_length(title) <= 64);
