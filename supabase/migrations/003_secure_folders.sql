-- BBQNote: Secure folder (PBKDF2 salt + AES-GCM for note title/content at rest)
-- Chạy sau khi đã có bảng folders từ bbqnote_setup.sql

ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS is_secure BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS secure_salt TEXT;

ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS pbkdf2_iterations INT NOT NULL DEFAULT 310000;

ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS secure_verifier_enc TEXT;

COMMENT ON COLUMN folders.secure_salt IS 'Base64 của 16 byte CSPRNG; không phải bí mật, dùng với PBKDF2.';
COMMENT ON COLUMN folders.secure_verifier_enc IS 'Chuỗi AES-GCM (retronote:1:...) của sentinel retronote:unlock — xác minh passphrase khi folder rỗng.';
