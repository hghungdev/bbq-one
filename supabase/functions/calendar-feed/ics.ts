/**
 * G1: dựng file iCalendar (RFC 5545) cho link Google Calendar — thuần, không I/O (chạy được cả Deno lẫn Node
 * để test). Google "Thêm lịch → Từ URL" chỉ ĐỌC file này theo chu kỳ của Google.
 */

export interface FeedEvent {
  id: string
  title: string
  description: string | null
  /** 'YYYY-MM-DD' */
  event_date: string
  /** 'HH:MM' hoặc 'HH:MM:SS'; null = cả ngày */
  start_time: string | null
  end_time: string | null
  is_done: boolean
  updated_at: string | null
}

export interface BuildIcsOptions {
  now: Date
  /** Múi giờ IANA của user (vd 'Asia/Ho_Chi_Minh') — chỉ dùng cho sự kiện có giờ. */
  tz?: string | null
  calName?: string
}

const CRLF = '\r\n'
const TZ_RE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/
const encoder = new TextEncoder()

/** Escape TEXT theo RFC 5545 §3.3.11. */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Gập dòng ≤ 75 BYTE UTF-8 (§3.1) — không cắt giữa một ký tự nhiều byte (tiếng Việt, ✓). */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  let curBytes = 0
  let limit = 75
  for (const ch of line) {
    const b = encoder.encode(ch).length
    if (curBytes + b > limit) {
      out.push(cur)
      cur = ' '
      curBytes = 1
      limit = 75
    }
    cur += ch
    curBytes += b
  }
  out.push(cur)
  return out.join(CRLF)
}

function ymd(dateKey: string): string {
  return dateKey.slice(0, 10).replace(/-/g, '')
}

/** Ngày hôm sau của 'YYYY-MM-DD' (DTEND của sự kiện cả ngày không tính ngày cuối). */
function nextDay(dateKey: string): string {
  const [y, m, d] = dateKey.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`
}

function hms(time: string): string {
  const [h = '00', mi = '00', s = '00'] = time.split(':')
  return `${h.padStart(2, '0')}${mi.padStart(2, '0')}${s.slice(0, 2).padStart(2, '0')}`
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function eventLines(e: FeedEvent, now: Date, tz: string | null): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@bbqone`, `DTSTAMP:${utcStamp(now)}`]
  if (e.start_time && tz) {
    const start = `${ymd(e.event_date)}T${hms(e.start_time)}`
    lines.push(`DTSTART;TZID=${tz}:${start}`)
    if (e.end_time) lines.push(`DTEND;TZID=${tz}:${ymd(e.event_date)}T${hms(e.end_time)}`)
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd(e.event_date)}`, `DTEND;VALUE=DATE:${nextDay(e.event_date)}`)
  }
  lines.push(`SUMMARY:${escapeText((e.is_done ? '✓ ' : '') + e.title)}`)
  if (e.description && e.description.trim() !== '') lines.push(`DESCRIPTION:${escapeText(e.description)}`)
  if (e.updated_at) {
    const t = new Date(e.updated_at)
    if (!Number.isNaN(t.getTime())) lines.push(`LAST-MODIFIED:${utcStamp(t)}`)
  }
  // Việc trong ngày, không chiếm lịch "bận" của user trên Google.
  lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  return lines
}

export function buildIcs(events: FeedEvent[], opts: BuildIcsOptions): string {
  const tz = opts.tz && TZ_RE.test(opts.tz) ? opts.tz : null
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BBQOne//Calendar Feed//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.calName ?? 'BBQOne')}`,
    ...(tz ? [`X-WR-TIMEZONE:${tz}`] : []),
    ...events.flatMap((e) => eventLines(e, opts.now, tz)),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join(CRLF) + CRLF
}
