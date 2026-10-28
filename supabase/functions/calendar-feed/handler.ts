import { buildIcs, type FeedEvent } from './ics.ts'

/**
 * G1: xử lý `GET /functions/v1/calendar-feed/<token>.ics` — thuần (deps tiêm vào) để test trong Node;
 * index.ts nối với Supabase (service role). Không kiểm JWT: Google Calendar tải link không đăng nhập, nên
 * token là cửa duy nhất — sai / không có / đã tắt đều trả CÙNG một 404 (không lộ link nào tồn tại).
 */

export interface FeedRow {
  user_id: string
  enabled: boolean
}

export interface FeedDeps {
  findFeed(token: string): Promise<FeedRow | null>
  listEvents(userId: string, fromDate: string, toDate: string): Promise<FeedEvent[]>
  touch(userId: string): Promise<void>
  now(): Date
}

/** 32 byte base64url, không padding. */
export const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
/** Cửa sổ sự kiện trong file: đủ nhìn lại một quý, nhìn tới hơn một năm; giữ file nhỏ (Google ~1 MB). */
export const WINDOW_PAST_DAYS = 90
export const WINDOW_FUTURE_DAYS = 400

function dateKeyUtc(d: Date, offsetDays: number): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offsetDays))
  return x.toISOString().slice(0, 10)
}

function notFound(): Response {
  return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export async function handleFeedRequest(req: Request, deps: FeedDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed\n', { status: 405, headers: { allow: 'GET, HEAD' } })
  }
  const url = new URL(req.url)
  const last = url.pathname.split('/').filter(Boolean).pop() ?? ''
  const token = last.endsWith('.ics') ? last.slice(0, -4) : last
  if (!FEED_TOKEN_RE.test(token)) return notFound()

  const feed = await deps.findFeed(token)
  if (!feed || !feed.enabled) return notFound()

  const now = deps.now()
  const events = await deps.listEvents(feed.user_id, dateKeyUtc(now, -WINDOW_PAST_DAYS), dateKeyUtc(now, WINDOW_FUTURE_DAYS))
  const body = buildIcs(events, { now, tz: url.searchParams.get('tz') })
  // Ghi lần Google tải gần nhất — không chặn phản hồi nếu lỗi.
  await deps.touch(feed.user_id).catch(() => {})

  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="bbqone.ics"',
      'cache-control': 'no-store',
    },
  })
}
