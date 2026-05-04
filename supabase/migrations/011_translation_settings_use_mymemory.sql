-- Sprint 2.5: Add use_mymemory toggle to user_translation_settings
-- Cho phép user tắt MyMemory API nếu muốn privacy-strict (Chrome built-in only)
ALTER TABLE user_translation_settings
  ADD COLUMN IF NOT EXISTS use_mymemory BOOLEAN NOT NULL DEFAULT TRUE;
