/** Nguồn backup: nút tay vs debounce trong background. */
export type BookmarkBackupLabelSource = 'manual' | 'auto'

/** Ngày theo Calendar sv → YYYY-mm-dd */
function bookmarkBackupDateSv(d: Date): string {
  return d.toLocaleDateString('sv')
}

/** Giờ:phút 24h, thay : bằng - trong nhãn (gọn trong list UI). */
function bookmarkBackupHmSv(d: Date): string {
  return d.toLocaleTimeString('sv', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/:/g, '-')
}

/**
 * Nhãn lưu trên Supabase/local: `{source}_backup_YYYY-mm-dd_HH-mm`.
 * Dùng cho BACKUP NOW và auto-backup sau thay đổi bookmark.
 */
export function buildBookmarkBackupLabel(source: BookmarkBackupLabelSource): string {
  const d = new Date()
  return `${source}_backup_${bookmarkBackupDateSv(d)}_${bookmarkBackupHmSv(d)}`
}
