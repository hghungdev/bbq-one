-- Run in Supabase SQL Editor (required for .textSearch('fts', ...))
-- Adds a stored tsvector column PostgREST can query.

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(content, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS notes_fts_col_idx ON notes USING gin (fts);
