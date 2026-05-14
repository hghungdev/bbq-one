-- BBQOne: Calendar events
-- v1 UI uses: title, description, is_done, position, event_date.
-- Future-proof columns (v2 + desktop app): color, start_time, end_time.

CREATE TABLE IF NOT EXISTS calendar_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core (v1)
  event_date      DATE NOT NULL,
  title           TEXT NOT NULL CHECK (char_length(title) <= 200),
  description     TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  is_done         BOOLEAN NOT NULL DEFAULT FALSE,
  position        INT NOT NULL DEFAULT 0,

  -- Future-proof (v2 + desktop app)
  color           TEXT DEFAULT NULL,
  start_time      TIME DEFAULT NULL,
  end_time        TIME DEFAULT NULL,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  synced_at       TIMESTAMPTZ DEFAULT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS calendar_events_user_date_idx
  ON calendar_events (user_id, event_date);
CREATE INDEX IF NOT EXISTS calendar_events_user_date_position_idx
  ON calendar_events (user_id, event_date, position);

-- updated_at trigger (reuse existing function from notes/folders migrations)
DROP TRIGGER IF EXISTS calendar_events_updated_at ON calendar_events;
CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();

-- RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar_events_owner" ON calendar_events;
CREATE POLICY "calendar_events_owner" ON calendar_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
