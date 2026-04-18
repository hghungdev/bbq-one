-- =============================================================================
-- BBQOne — Supabase: schema + FTS + RLS + (tùy chọn) user dev
-- =============================================================================
-- Chạy toàn bộ file này trong Supabase → SQL Editor (một lần trên project mới).
--
-- Thứ tự nội dung:
--   1) Bảng folders / notes + trigger cập nhật updated_at
--   2) Cột FTS (full-text search) + index GIN
--   3) Row Level Security + policy owner
--   4) Tạo user: xem cuối file — khuyên dùng Dashboard; có thêm block SQL tùy chọn
--
-- File cũ 001_notes_fts_column.sql và 002_rls_policies.sql vẫn giữ để tham chiếu;
-- nội dung đã được gộp vào đây.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bảng
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INT DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  folder_id   UUID REFERENCES folders (id) ON DELETE SET NULL,
  title       TEXT DEFAULT '',
  tags        TEXT[] DEFAULT '{}',
  synced_at   TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_bodies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  note_id     UUID NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  position    INT NOT NULL DEFAULT 0,
  synced_at   TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS note_bodies_note_id_idx ON note_bodies (note_id);
CREATE INDEX IF NOT EXISTS note_bodies_note_id_position_idx ON note_bodies (note_id, position);

-- -----------------------------------------------------------------------------
-- 2. Trigger: tự cập nhật notes.updated_at khi UPDATE
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.retronote_update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_updated_at ON notes;

CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();

DROP TRIGGER IF EXISTS folders_updated_at ON folders;

CREATE TRIGGER folders_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();

DROP TRIGGER IF EXISTS note_bodies_updated_at ON note_bodies;

CREATE TRIGGER note_bodies_updated_at
  BEFORE UPDATE ON note_bodies
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();

CREATE OR REPLACE FUNCTION public.note_bodies_touch_parent_note()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE notes SET updated_at = now()
  WHERE id = COALESCE(NEW.note_id, OLD.note_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- touch_parent gắn sau khi có notes.fts (mục 3) — tránh edge case migration từ DB cũ.

-- -----------------------------------------------------------------------------
-- 3. Full-text search: notes (title + tags), note_bodies (label + content)
-- fts: cột thường + trigger — không dùng GENERATED (42P17 trên Supabase với tags::text).
-- -----------------------------------------------------------------------------

ALTER TABLE notes DROP COLUMN IF EXISTS fts CASCADE;

ALTER TABLE notes ADD COLUMN IF NOT EXISTS fts tsvector;

CREATE OR REPLACE FUNCTION public.notes_set_fts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts := to_tsvector(
    'english'::regconfig,
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.tags::text, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_set_fts ON notes;

CREATE TRIGGER notes_set_fts
  BEFORE INSERT OR UPDATE OF title, tags ON notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_set_fts();

CREATE INDEX IF NOT EXISTS notes_fts_col_idx ON notes USING gin (fts);

ALTER TABLE note_bodies
  ADD COLUMN IF NOT EXISTS fts tsvector;

CREATE OR REPLACE FUNCTION public.note_bodies_set_fts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts := to_tsvector(
    'english'::regconfig,
    coalesce(NEW.label, '') || ' ' || coalesce(NEW.content, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS note_bodies_set_fts ON note_bodies;

CREATE TRIGGER note_bodies_set_fts
  BEFORE INSERT OR UPDATE OF label, content ON note_bodies
  FOR EACH ROW
  EXECUTE FUNCTION public.note_bodies_set_fts();

CREATE INDEX IF NOT EXISTS note_bodies_fts_idx ON note_bodies USING gin (fts);

DROP TRIGGER IF EXISTS note_bodies_touch_note ON note_bodies;

CREATE TRIGGER note_bodies_touch_note
  AFTER INSERT OR UPDATE OR DELETE ON note_bodies
  FOR EACH ROW
  EXECUTE FUNCTION public.note_bodies_touch_parent_note();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_bodies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "folders_owner" ON folders;
DROP POLICY IF EXISTS "notes_owner" ON notes;
DROP POLICY IF EXISTS "note_bodies_owner" ON note_bodies;

CREATE POLICY "folders_owner" ON folders
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notes_owner" ON notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "note_bodies_owner" ON note_bodies
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 5. Tạo user để đăng nhập BBQOne
-- =============================================================================
--
-- CÁCH A — Khuyên dùng (production / ít rủi ro)
-- -------------------------------------------
-- 1. Vào Supabase Dashboard → Authentication → Users.
-- 2. "Add user" → chọn "Create new user".
-- 3. Nhập email + password (bật "Auto Confirm User" nếu không muốn xác nhận email).
-- 4. Lưu; dùng đúng email/password trong popup extension (signInWithPassword).
--
-- CÁCH B — SQL (chỉ dev / khi bạn hiểu rõ auth schema Supabase)
-- ------------------------------------------------------------
-- Bật extension mã hóa mật khẩu (thường đã có trên Supabase):
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Đổi email / mật khẩu bên dưới trước khi chạy. Chạy MỘT lần; nếu user đã tồn tại sẽ lỗi trùng email.
DO $$
DECLARE
  v_user_id   UUID := gen_random_uuid();
  v_email     TEXT := 'dev@bbqone.local';
  v_password  TEXT := 'ChangeMe123!';
  v_instance  UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous,
    created_at,
    updated_at
  )
  VALUES (
    v_instance,
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}',
    false,
    false,
    now(),
    now()
  );

  -- Với provider "email", provider_id thường là user id (chuỗi UUID), không phải địa chỉ email.
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );
END $$;

-- Nếu block DO $$ ở trên báo lỗi thiếu cột / constraint:
--   - Dùng Cách A (Dashboard), hoặc
--   - Mở Table editor → auth.users / auth.identities và chỉnh cho khớp phiên bản project.
--
-- Sau khi tạo user (A hoặc B), đăng nhập extension bằng cùng email/password.
-- =============================================================================
