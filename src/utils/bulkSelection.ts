/**
 * U7: chọn hàng loạt (chọn tất cả / chọn cả nhóm / Shift + bấm chọn liên tiếp). Thuần, không sửa Set
 * truyền vào — luôn trả Set mới để Vue thấy thay đổi.
 */

export type SelectionState = 'none' | 'some' | 'all'

export function selectionState(ids: readonly string[], selected: ReadonlySet<string>): SelectionState {
  if (ids.length === 0) return 'none'
  let n = 0
  for (const id of ids) if (selected.has(id)) n++
  if (n === 0) return 'none'
  return n === ids.length ? 'all' : 'some'
}

/** Nhóm đã chọn đủ → bỏ chọn cả nhóm; còn thiếu → chọn hết. Mục ngoài nhóm giữ nguyên. */
export function toggleMany(ids: readonly string[], selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected)
  if (selectionState(ids, selected) === 'all') for (const id of ids) next.delete(id)
  else for (const id of ids) next.add(id)
  return next
}

/** Đặt `checked` cho mọi mục từ anchor tới target (theo thứ tự hiển thị, cả hai chiều). */
export function selectRange(
  ordered: readonly string[],
  anchorId: string | null,
  targetId: string,
  checked: boolean,
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected)
  const to = ordered.indexOf(targetId)
  const from = anchorId === null ? -1 : ordered.indexOf(anchorId)
  const [lo, hi] = from === -1 ? [to, to] : [Math.min(from, to), Math.max(from, to)]
  for (let i = lo; i <= hi; i++) {
    if (i < 0) continue
    if (checked) next.add(ordered[i])
    else next.delete(ordered[i])
  }
  return next
}
