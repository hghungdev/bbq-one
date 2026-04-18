-- BBQ-One: bỏ cột source_url
ALTER TABLE user_dictionary_entries
  DROP COLUMN IF EXISTS source_url;
