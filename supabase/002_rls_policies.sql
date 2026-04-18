-- RLS for BBQOne (run after folders/notes tables exist — see SPRINT-PLAN.md schema)
-- Safe to re-run: drops policies by name then recreates.

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "folders_owner" ON folders;
DROP POLICY IF EXISTS "notes_owner" ON notes;

CREATE POLICY "folders_owner" ON folders
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notes_owner" ON notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
