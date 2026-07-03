-- C9: Optimistic concurrency guard — server từ chối push nếu row cloud mới hơn bản client last-seen.
-- Client gửi p_expected_updated_at = updated_at server lúc lần pull/synced gần nhất (cache synced_at baseline).
-- Conflict → EXCEPTION 'BBQ_CONFLICT' (SQLSTATE P0001) — client skip / pull / dialog sau.

-- ─── Notes ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bbq_update_note_if_current(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_folder_id uuid,
  p_tags text[],
  p_synced_at timestamptz
)
RETURNS public.notes
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result public.notes;
BEGIN
  UPDATE public.notes
  SET
    title = p_title,
    folder_id = p_folder_id,
    tags = COALESCE(p_tags, '{}'),
    synced_at = p_synced_at
  WHERE id = p_id
    AND user_id = auth.uid()
    AND updated_at = p_expected_updated_at
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BBQ_CONFLICT: note % was updated elsewhere', p_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN result;
END;
$$;

-- ─── Note bodies ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bbq_update_note_body_if_current(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_label text,
  p_content text,
  p_synced_at timestamptz
)
RETURNS public.note_bodies
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result public.note_bodies;
BEGIN
  UPDATE public.note_bodies
  SET
    label = p_label,
    content = p_content,
    synced_at = p_synced_at
  WHERE id = p_id
    AND user_id = auth.uid()
    AND updated_at = p_expected_updated_at
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BBQ_CONFLICT: note_body % was updated elsewhere', p_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN result;
END;
$$;

-- ─── Calendar events ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bbq_update_calendar_event_if_current(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_description text,
  p_event_date date,
  p_is_done boolean,
  p_position int,
  p_color text,
  p_synced_at timestamptz
)
RETURNS public.calendar_events
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result public.calendar_events;
BEGIN
  UPDATE public.calendar_events
  SET
    title = p_title,
    description = p_description,
    event_date = p_event_date,
    is_done = p_is_done,
    position = p_position,
    color = p_color,
    synced_at = p_synced_at
  WHERE id = p_id
    AND user_id = auth.uid()
    AND updated_at = p_expected_updated_at
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BBQ_CONFLICT: calendar_event % was updated elsewhere', p_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bbq_update_note_if_current TO authenticated;
GRANT EXECUTE ON FUNCTION public.bbq_update_note_body_if_current TO authenticated;
GRANT EXECUTE ON FUNCTION public.bbq_update_calendar_event_if_current TO authenticated;
