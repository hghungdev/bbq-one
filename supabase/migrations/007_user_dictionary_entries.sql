-- BBQ-One: Personal dictionary entries
-- Phase 1 columns. Phase 2 sẽ add: starred, tags, mastery_level, review_count, last_reviewed_at

CREATE TABLE IF NOT EXISTS user_dictionary_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core translation (Phase 1)
  source_text        TEXT NOT NULL,
  source_lang        TEXT NOT NULL,         -- ISO 639-1, actual lang (auto-detected)
  target_lang        TEXT NOT NULL,
  translated_text    TEXT NOT NULL,

  -- Classification
  entry_type         TEXT NOT NULL DEFAULT 'word',    -- 'word' | 'phrase' | 'sentence'

  -- Provenance
  provider           TEXT NOT NULL DEFAULT 'chrome-local',
  source_url         TEXT DEFAULT '',                 -- URL khi quét
  source_context     TEXT DEFAULT '',                 -- 50 chars before/after

  -- User metadata (Phase 1 optional, Phase 2 enhance)
  custom_note        TEXT DEFAULT '',

  -- Phase 2 extension points (để sẵn, Phase 1 không set)
  enrichment         JSONB DEFAULT NULL,              -- {synonyms, examples, phonetic, grammar}
  starred            BOOLEAN NOT NULL DEFAULT FALSE,
  tags               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Phase 3 extension points (spaced repetition)
  mastery_level      SMALLINT NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 5),
  review_count       INT NOT NULL DEFAULT 0,
  last_reviewed_at   TIMESTAMPTZ DEFAULT NULL,

  -- FTS (cột thường + trigger — pattern 005)
  fts                tsvector,

  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS user_dictionary_user_id_idx
  ON user_dictionary_entries (user_id);
CREATE INDEX IF NOT EXISTS user_dictionary_user_created_idx
  ON user_dictionary_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_dictionary_fts_idx
  ON user_dictionary_entries USING gin (fts);
-- Prevent duplicate (same source text + langs per user)
CREATE UNIQUE INDEX IF NOT EXISTS user_dictionary_unique_source
  ON user_dictionary_entries (user_id, source_text, source_lang, target_lang);

-- FTS trigger
CREATE OR REPLACE FUNCTION public.user_dictionary_set_fts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts := to_tsvector(
    'simple'::regconfig,  -- simple vì đa ngôn ngữ; english stemmer sẽ sai với vi/ja
    coalesce(NEW.source_text, '') || ' ' ||
    coalesce(NEW.translated_text, '') || ' ' ||
    coalesce(NEW.custom_note, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_dictionary_set_fts ON user_dictionary_entries;
CREATE TRIGGER user_dictionary_set_fts
  BEFORE INSERT OR UPDATE OF source_text, translated_text, custom_note
  ON user_dictionary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.user_dictionary_set_fts();

-- updated_at trigger
DROP TRIGGER IF EXISTS user_dictionary_updated_at ON user_dictionary_entries;
CREATE TRIGGER user_dictionary_updated_at
  BEFORE UPDATE ON user_dictionary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();

-- RLS
ALTER TABLE user_dictionary_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_dictionary_entries_owner" ON user_dictionary_entries;
CREATE POLICY "user_dictionary_entries_owner" ON user_dictionary_entries
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
