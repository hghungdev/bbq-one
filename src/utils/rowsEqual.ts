/**
 * P5: hai danh sách row có cùng tập row (theo `id`, không trùng id) và từng trường `===` (mảng như `tags` so từng
 * phần tử) — thứ tự không quan trọng. Dùng để biết lần tải mới có mang gì mới không trước khi ghi lại cả cache.
 */
export function sameRows<T extends { id: string }>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map<string, T>()
  for (const row of b) byId.set(row.id, row)
  if (byId.size !== b.length) return false
  const seen = new Set<string>()
  for (const row of a) {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    const other = byId.get(row.id)
    if (!other || !sameFields(row, other)) return false
  }
  return true
}

function sameFields(a: object, b: object): boolean {
  if (a === b) return true
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  for (const k of keysA) {
    const x = (a as Record<string, unknown>)[k]
    const y = (b as Record<string, unknown>)[k]
    if (x === y) continue
    if (Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i])) continue
    return false
  }
  return true
}
