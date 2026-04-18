-- BBQNote: PIN + mã hóa bookmark (E2E phía client)
-- Chạy trong Supabase SQL Editor sau 005_bookmarks.sql

-- Metadata xác thực PIN (salt + verifier đã mã hóa), không lưu PIN
CREATE TABLE IF NOT EXISTS bookmark_crypto (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  salt          TEXT NOT NULL,
  verifier_iv   TEXT NOT NULL,
  verifier_ct   TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bookmark_backups
  ADD COLUMN IF NOT EXISTS encrypted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE bookmark_backups
  ADD COLUMN IF NOT EXISTS payload_iv TEXT;

ALTER TABLE bookmark_backups
  ADD COLUMN IF NOT EXISTS payload_ciphertext TEXT;

-- Backup cũ: tree_json đầy; backup mã hóa: tree_json NULL, payload_*
ALTER TABLE bookmark_backups
  ALTER COLUMN tree_json DROP NOT NULL;

ALTER TABLE bookmark_crypto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookmark_crypto_owner" ON bookmark_crypto
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
