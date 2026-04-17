-- Run in Supabase SQL Editor (required for .textSearch('fts', ...))
-- fts = cột thường + trigger (GENERATED hay gặp 42P17 trên Supabase).
-- Schema cũ: title + content (chưa có note_bodies).

ALTER TABLE notes DROP COLUMN IF EXISTS fts CASCADE;

ALTER TABLE notes ADD COLUMN IF NOT EXISTS fts tsvector;

CREATE OR REPLACE FUNCTION public.notes_set_fts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts := to_tsvector(
    'english'::regconfig,
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_set_fts ON notes;

CREATE TRIGGER notes_set_fts
  BEFORE INSERT OR UPDATE OF title, content ON notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_set_fts();

UPDATE notes SET
  fts = to_tsvector(
    'english'::regconfig,
    coalesce(title, '') || ' ' || coalesce(content, '')
  );

CREATE INDEX IF NOT EXISTS notes_fts_col_idx ON notes USING gin (fts);
