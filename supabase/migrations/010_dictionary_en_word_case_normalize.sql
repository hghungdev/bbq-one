-- Gộp trùng từ đơn EN chỉ khác hoa/thường (lead / Lead), rồi chuẩn hóa source_text → lowercase.

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, lower(trim(source_text)), source_lang, target_lang
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM user_dictionary_entries
  WHERE source_lang = 'en'
    AND trim(source_text) NOT LIKE '% %'
)
DELETE FROM user_dictionary_entries
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE user_dictionary_entries
SET source_text = lower(trim(source_text))
WHERE source_lang = 'en'
  AND trim(source_text) NOT LIKE '% %';
