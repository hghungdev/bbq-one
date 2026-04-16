/** Chuẩn hóa thông báo lỗi đăng nhập (extension thường gặp TypeError: Failed to fetch). */
export function formatAuthErrorMessage(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String(error)
  const lower = raw.toLowerCase()

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return (
      '[NETWORK] Không gọi được Supabase. Kiểm tra: (1) Internet / VPN / firewall; ' +
      '(2) Project Supabase không bị pause; (3) File .env có VITE_SUPABASE_URL (https://…project….supabase.co) và VITE_SUPABASE_ANON_KEY; ' +
      '(4) Sau khi sửa .env chạy lại npm run build; (5) chrome://extensions → Reload extension; ' +
      '(6) Tắt extension chặn request (adblock) thử lại.'
    )
  }

  return raw
}
