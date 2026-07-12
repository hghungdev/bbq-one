/** PostgREST (Supabase hosted) cap mặc định 1.000 rows/response — phải phân trang. */
export const SUPABASE_PAGE_SIZE = 1000

interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>
}

/**
 * Kéo TOÀN BỘ rows theo trang. `makeQuery` PHẢI trả về một builder MỚI mỗi lần gọi
 * (builder PostgREST là mutable — không reuse được giữa 2 lần .range()).
 * Dừng khi trang trả về ngắn hơn pageSize.
 */
export async function fetchAllRows<T>(
  makeQuery: () => RangeQuery<T>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await makeQuery().range(offset, offset + pageSize - 1)
    if (error) throw error
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < pageSize) return all
  }
}
