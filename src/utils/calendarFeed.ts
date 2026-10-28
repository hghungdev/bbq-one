/**
 * G1: token + URL của link Google Calendar — thuần để test. Token = 32 byte ngẫu nhiên → base64url
 * 43 ký tự (khớp CHECK của bảng calendar_feeds và FEED_TOKEN_RE của Edge Function).
 */

const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function feedTokenFromBytes(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isValidFeedToken(token: string): boolean {
  return FEED_TOKEN_RE.test(token)
}

/** `<supabase>/functions/v1/calendar-feed/<token>.ics?tz=<IANA>` — tz để sự kiện có giờ đúng múi giờ. */
export function buildFeedUrl(supabaseUrl: string, token: string, tz: string | null): string {
  const base = supabaseUrl.replace(/\/+$/, '')
  const query = tz ? `?tz=${encodeURIComponent(tz)}` : ''
  return `${base}/functions/v1/calendar-feed/${token}.ics${query}`
}
