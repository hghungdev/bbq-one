-- BBQOne: bỏ cột source_context — không lưu ngữ cảnh câu nữa
ALTER TABLE user_dictionary_entries
  DROP COLUMN IF EXISTS source_context;
