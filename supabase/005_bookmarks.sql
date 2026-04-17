-- BBQNote: Bookmark Backup
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bookmark_backups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT '',          -- tên snapshot, VD: "2026-04-17 auto"
  tree_json    JSONB NOT NULL,                    -- toàn bộ chrome.bookmarks.getTree()
  browser_hint TEXT DEFAULT '',                   -- "chrome" | "edge" | "brave" v.v.
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Mỗi user chỉ giữ tối đa 20 backup (xóa cũ khi insert mới — trigger)
CREATE OR REPLACE FUNCTION public.bbq_trim_bookmark_backups()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM bookmark_backups
  WHERE id IN (
    SELECT id FROM bookmark_backups
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    OFFSET 20
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trim_bookmark_backups ON bookmark_backups;
CREATE TRIGGER trim_bookmark_backups
  AFTER INSERT ON bookmark_backups
  FOR EACH ROW EXECUTE FUNCTION public.bbq_trim_bookmark_backups();

-- RLS
ALTER TABLE bookmark_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON bookmark_backups
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
