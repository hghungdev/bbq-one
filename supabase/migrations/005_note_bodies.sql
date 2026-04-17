-- BBQNote: 1 note → nhiều body (note_bodies). Migrate content từ notes.content.
-- Chạy sau bbqnote_setup + các migration folder secure trước đó.
--
-- Dữ liệu: INSERT (bước 2) nên chạy TRƯỚC khi DROP notes.content.
-- Nếu bạn đã DROP content trước khi INSERT: bước 2 chỉ tạo body rỗng — nội dung cũ không còn trong DB (cần backup).
--
-- Lỗi 42P17 khi INSERT (bước 2): trigger AFTER INSERT trên note_bodies gọi UPDATE notes;
-- PostgreSQL tái tính cột GENERATED fts trên notes — nếu fts cũ dùng array_to_string (STABLE)
-- thì UPDATE đó báo 42P17. Vì vậy:
--   - Không gắn trigger touch_parent trước khi migrate xong notes (bước 3).
--   - fts trên note_bodies: cột thường + BEFORE trigger (trigger được phép dùng to_tsvector).
--
-- notes.fts: không dùng GENERATED — tags::text / to_tsvector trong GENERATED có thể 42P17 trên Supabase.

-- -----------------------------------------------------------------------------
-- 1. Bảng note_bodies (fts = cột thường, set bởi trigger — tránh 42P17 trên GENERATED)
-- -----------------------------------------------------------------------------

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

-- Sửa từ lần chạy lỗi: bỏ GENERATED fts nếu đã tạo
ALTER TABLE note_bodies DROP COLUMN IF EXISTS fts CASCADE;

ALTER TABLE note_bodies
  ADD COLUMN IF NOT EXISTS fts tsvector;

CREATE INDEX IF NOT EXISTS note_bodies_note_id_idx ON note_bodies (note_id);
CREATE INDEX IF NOT EXISTS note_bodies_note_id_position_idx ON note_bodies (note_id, position);

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

DROP TRIGGER IF EXISTS note_bodies_updated_at ON note_bodies;

CREATE TRIGGER note_bodies_updated_at
  BEFORE UPDATE ON note_bodies
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();

-- CHÚ Ý: chưa tạo note_bodies_touch_note — sẽ tạo sau bước 3 (sau khi notes.fts đã đúng).

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

-- -----------------------------------------------------------------------------
-- 2. Migrate dữ liệu: mỗi note cũ → ít nhất một body (label rỗng = default UI)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notes'
      AND column_name = 'content'
  ) THEN
    INSERT INTO note_bodies (user_id, note_id, label, content, position)
    SELECT
      n.user_id,
      n.id,
      '',
      COALESCE(n.content, ''),
      0
    FROM notes n
    WHERE NOT EXISTS (
      SELECT 1 FROM note_bodies b WHERE b.note_id = n.id
    );
  ELSE
    INSERT INTO note_bodies (user_id, note_id, label, content, position)
    SELECT
      n.user_id,
      n.id,
      '',
      '',
      0
    FROM notes n
    WHERE NOT EXISTS (
      SELECT 1 FROM note_bodies b WHERE b.note_id = n.id
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Gỡ content + fts cũ trên notes; fts = cột thường + trigger (tránh 42P17 GENERATED)
-- -----------------------------------------------------------------------------

DROP INDEX IF EXISTS notes_fts_col_idx;

ALTER TABLE notes DROP COLUMN IF EXISTS fts;
ALTER TABLE notes DROP COLUMN IF EXISTS content;

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

UPDATE notes SET
  fts = to_tsvector(
    'english'::regconfig,
    coalesce(title, '') || ' ' || coalesce(tags::text, '')
  );

CREATE INDEX IF NOT EXISTS notes_fts_col_idx ON notes USING gin (fts);

-- Sau khi notes.fts an toàn: mới bật trigger cập nhật parent.updated_at khi body đổi
DROP TRIGGER IF EXISTS note_bodies_touch_note ON note_bodies;

CREATE TRIGGER note_bodies_touch_note
  AFTER INSERT OR UPDATE OR DELETE ON note_bodies
  FOR EACH ROW
  EXECUTE FUNCTION public.note_bodies_touch_parent_note();

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------

ALTER TABLE note_bodies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "note_bodies_owner" ON note_bodies;

CREATE POLICY "note_bodies_owner" ON note_bodies
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
