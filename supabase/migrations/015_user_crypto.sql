-- S2B: hạ tầng khóa account-level (DEK/KEK + recovery). Phase 2a — chưa client nào ghi/đọc
-- cho tới S2C. Chạy trong Supabase SQL Editor sau 014_optimistic_update_guard.sql.
-- Tiền lệ shape: bookmark_crypto (006) — user_id PK, RLS owner.

CREATE TABLE IF NOT EXISTS user_crypto (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- tham số KDF nằm trong DB → S4 nâng Argon2id bằng UPDATE + re-wrap, không phá dữ liệu
  kdf                  TEXT        NOT NULL DEFAULT 'pbkdf2-sha256',
  kdf_params           JSONB       NOT NULL DEFAULT '{"iterations":600000}'::jsonb,
  kdf_salt             TEXT        NOT NULL,            -- base64, 16B CSPRNG

  -- DEK được bọc 2 lần: bằng KEK (passphrase) và bằng RKEK (recovery key)
  dek_id               TEXT        NOT NULL DEFAULT 'k1',
  wrapped_dek          TEXT        NOT NULL,            -- bbq:2:A256GCM:<dek_id>:<iv>:<ct>
  wrapped_dek_recovery TEXT,                            -- NULL = chưa tạo recovery key

  -- sentinel kiểm passphrase không cần chạm dữ liệu thật
  verifier             TEXT        NOT NULL,            -- bbq:2:A256GCM:kek:<iv>:<ct>

  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_crypto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_crypto_owner" ON user_crypto;
CREATE POLICY "user_crypto_owner" ON user_crypto
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_crypto_updated_at ON user_crypto;
CREATE TRIGGER user_crypto_updated_at
  BEFORE UPDATE ON user_crypto
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();
