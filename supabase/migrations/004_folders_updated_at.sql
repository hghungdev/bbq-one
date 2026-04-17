-- Cột updated_at cho folders + trigger (function dùng chung với notes)
CREATE OR REPLACE FUNCTION public.retronote_update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill: dùng created_at làm mốc ban đầu (sau ADD COLUMN mặc định có thể là now()).
UPDATE folders
SET updated_at = created_at;

ALTER TABLE folders
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE folders
  ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS folders_updated_at ON folders;

CREATE TRIGGER folders_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();
