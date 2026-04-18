-- BBQ-One: User translation preferences
-- Run in Supabase SQL Editor sau khi migrate 005.

CREATE TABLE IF NOT EXISTS user_translation_settings (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  native_language     TEXT NOT NULL DEFAULT 'vi',            -- ISO 639-1
  learning_languages  TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[],
  default_provider    TEXT NOT NULL DEFAULT 'chrome-local',  -- Phase 2 có thể = 'gemini'
  auto_detect         BOOLEAN NOT NULL DEFAULT TRUE,
  auto_save           BOOLEAN NOT NULL DEFAULT FALSE,        -- Phase 1 = manual save
  -- Phase 2 extension point (để sẵn, không dùng Phase 1)
  domain_overrides    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Trigger updated_at (reuse function đã có)
DROP TRIGGER IF EXISTS user_translation_settings_updated_at ON user_translation_settings;
CREATE TRIGGER user_translation_settings_updated_at
  BEFORE UPDATE ON user_translation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();

-- RLS
ALTER TABLE user_translation_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_translation_settings_owner" ON user_translation_settings;
CREATE POLICY "user_translation_settings_owner" ON user_translation_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
