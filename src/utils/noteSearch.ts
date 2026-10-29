import type { Note, NoteBody } from '@/types'
import { bodySearchText } from '@/utils/text'

/**
 * P4: lọc ghi chú theo tên / thẻ / nhãn body / CHỮ trong body — so trên plain text (nhớ theo body), không trên HTML
 * thô (gõ "strong", "class", "href" không còn khớp mọi ghi chú có định dạng). Dùng chỉ mục `bodiesByNote` (P3),
 * giữ thứ tự đầu vào.
 */
export function filterNotesByText(
  notes: readonly Note[],
  bodiesByNote: ReadonlyMap<string, readonly NoteBody[]>,
  query: string,
): Note[] {
  const lower = query.trim().toLowerCase()
  if (!lower) return []
  return notes.filter((n) => {
    if (n.title.toLowerCase().includes(lower)) return true
    if (n.tags.some((t) => t.toLowerCase().includes(lower))) return true
    for (const b of bodiesByNote.get(n.id) ?? []) {
      if (b.label.toLowerCase().includes(lower)) return true
      if (bodySearchText(b).includes(lower)) return true
    }
    return false
  })
}
