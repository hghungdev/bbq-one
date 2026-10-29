/**
 * P3: chỉ mục body theo ghi chú — một lượt O(N) cho cả kho, thay cho việc MỖI dòng danh sách tự lọc + sắp xếp
 * toàn bộ `bodies` (600 dòng × 4.000 body).
 *
 * Mỗi nhóm sắp theo `position` (sort ổn định → đúng thứ tự `filter` + `sort` cũ). Có `prev`: nhóm nào giữ nguyên
 * từng object theo thứ tự thì dùng lại ĐÚNG mảng cũ → computed của dòng ghi chú khác không bị tính lại.
 */
export function indexBodiesByNote<T extends { note_id: string; position: number }>(
  bodies: readonly T[],
  prev?: ReadonlyMap<string, readonly T[]>,
): Map<string, readonly T[]> {
  const groups = new Map<string, T[]>()
  for (const b of bodies) {
    const list = groups.get(b.note_id)
    if (list) list.push(b)
    else groups.set(b.note_id, [b])
  }
  const index = new Map<string, readonly T[]>()
  for (const [noteId, list] of groups) {
    if (list.length > 1) list.sort((a, b) => a.position - b.position)
    const old = prev?.get(noteId)
    index.set(noteId, old && sameItems(old, list) ? old : list)
  }
  return index
}

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
