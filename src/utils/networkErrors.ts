/** Lỗi do mạng / timeout — dùng cho fallback lưu local & retry sync sau. */
export function isNetworkError(error: unknown): boolean {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String(error)
  const lower = raw.toLowerCase()
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  )
}
