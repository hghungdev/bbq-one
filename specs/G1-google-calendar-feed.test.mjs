/**
 * FAILING TEST — G1: link Google Calendar (iCal, một chiều), mỗi user một link riêng trong Settings.
 *
 * Chạy:   node specs/G1-google-calendar-feed.test.mjs
 *
 * I — buildIcs (CODE THẬT của Edge Function, chạy trong Node).
 * H — handleFeedRequest (CODE THẬT, deps giả: tìm feed / liệt kê sự kiện / ghi last_fetched_at / giờ).
 * C — utils/calendarFeed.ts (token, URL).
 * S — cấu trúc: migration, index.ts, service, Settings, i18n.
 * GREEN sau khi áp specs/G1-google-calendar-feed.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}
function loadTs(rel, mocks = {}) {
  const file = path.join(ROOT, rel)
  if (!fs.existsSync(file)) return null
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  const req = (spec) => {
    if (spec in mocks) return mocks[spec]
    throw new Error(`Unmocked import in ${rel}: ${spec}`)
  }
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports)
  return mod.exports
}
const bytes = (s) => Buffer.byteLength(s, 'utf8')
const unfold = (s) => s.replace(/\r\n[ \t]/g, '')

const NOW = new Date('2026-10-28T03:04:05Z')
const ev = (o) => ({
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  title: 'VIB',
  description: '',
  event_date: '2026-10-31',
  start_time: null,
  end_time: null,
  is_done: false,
  updated_at: '2026-10-27T10:00:00Z',
  ...o,
})

// ═════════════════════════════════════════════════════════════════════════════
console.log('I — buildIcs')
const ics = loadTs('supabase/functions/calendar-feed/ics.ts')
if (!ics?.buildIcs) {
  check('I0 supabase/functions/calendar-feed/ics.ts export buildIcs', false, 'chưa có')
} else {
  const out = ics.buildIcs([ev({})], { now: NOW })
  check(
    'I1 VCALENDAR hợp lệ, mọi dòng kết thúc CRLF',
    out.startsWith('BEGIN:VCALENDAR\r\n') && out.endsWith('END:VCALENDAR\r\n') && /VERSION:2\.0\r\n/.test(out) &&
      /PRODID:/.test(out) && /X-WR-CALNAME:BBQOne/.test(out) && !/[^\r]\n/.test(out),
    JSON.stringify(out.slice(0, 120)),
  )
  check(
    'I2 cả ngày: DTSTART;VALUE=DATE + DTEND = hôm sau (qua tháng 31/10 → 01/11); UID ổn định; DTSTAMP UTC',
    out.includes('DTSTART;VALUE=DATE:20261031\r\n') && out.includes('DTEND;VALUE=DATE:20261101\r\n') &&
      out.includes('UID:a1b2c3d4-0000-4000-8000-000000000001@bbqone\r\n') && out.includes('DTSTAMP:20261028T030405Z\r\n') &&
      out.includes('TRANSP:TRANSPARENT'),
    out,
  )
  check('I3 đã xong → "✓ " trước tiêu đề', ics.buildIcs([ev({ is_done: true })], { now: NOW }).includes('SUMMARY:✓ VIB\r\n'), 'thiếu ✓')
  const esc = unfold(ics.buildIcs([ev({ title: 'A, B; C\\D', description: 'dòng 1\ndòng 2' })], { now: NOW }))
  check(
    'I4 escape , ; \\ và xuống dòng',
    esc.includes('SUMMARY:A\\, B\\; C\\\\D\r\n') && esc.includes('DESCRIPTION:dòng 1\\ndòng 2\r\n'),
    esc,
  )
  const longDesc = 'Họp review kế hoạch quý 4 với khách hàng HSBC tại văn phòng tầng 12 — chuẩn bị tài liệu đầy đủ'
  const folded = ics.buildIcs([ev({ description: longDesc })], { now: NOW })
  const lines = folded.split('\r\n').filter(Boolean)
  check(
    'I5 gập dòng ≤ 75 byte UTF-8 (tiếng Việt), mở lại ra đúng nội dung',
    lines.every((l) => bytes(l) <= 75) && unfold(folded).includes(`DESCRIPTION:${longDesc}\r\n`) && lines.some((l) => l.startsWith(' ')),
    lines.filter((l) => bytes(l) > 75).join(' | ') || 'không gập',
  )
  const timed = ics.buildIcs([ev({ event_date: '2026-10-28', start_time: '09:00', end_time: '10:30:00' })], { now: NOW, tz: 'Asia/Ho_Chi_Minh' })
  const timedNoTz = ics.buildIcs([ev({ event_date: '2026-10-28', start_time: '09:00' })], { now: NOW, tz: 'not a zone;' })
  check(
    'I6 có giờ + tz hợp lệ → DTSTART;TZID; tz không hợp lệ → về cả ngày',
    timed.includes('DTSTART;TZID=Asia/Ho_Chi_Minh:20261028T090000\r\n') && timed.includes('DTEND;TZID=Asia/Ho_Chi_Minh:20261028T103000\r\n') &&
      timedNoTz.includes('DTSTART;VALUE=DATE:20261028\r\n'),
    timed,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nH — handleFeedRequest')
const handlerMod = ics ? loadTs('supabase/functions/calendar-feed/handler.ts', { './ics.ts': ics }) : null
const TOKEN = 'A'.repeat(20) + '_-' + 'b'.repeat(21) // 43 ký tự base64url
if (!handlerMod?.handleFeedRequest) {
  check('H0 supabase/functions/calendar-feed/handler.ts export handleFeedRequest', false, 'chưa có')
} else {
  const calls = { find: [], list: [], touch: [] }
  const feeds = { [TOKEN]: { user_id: 'u1', enabled: true }, ['C'.repeat(43)]: { user_id: 'u2', enabled: false } }
  const deps = {
    findFeed: async (t) => (calls.find.push(t), feeds[t] ?? null),
    listEvents: async (uid, from, to) => (calls.list.push([uid, from, to]), [ev({ title: 'HSBC' })]),
    touch: async (uid) => void calls.touch.push(uid),
    now: () => NOW,
  }
  const url = (tok, q = '') => `https://x.supabase.co/functions/v1/calendar-feed/${tok}.ics${q}`
  const ok = await handlerMod.handleFeedRequest(new Request(url(TOKEN, '?tz=Asia%2FHo_Chi_Minh')), deps)
  const body = await ok.text()
  check(
    'H1 token đúng → 200 text/calendar, sự kiện của ĐÚNG user, cửa sổ −90 → +400 ngày, ghi last_fetched_at',
    ok.status === 200 && /^text\/calendar/.test(ok.headers.get('content-type') ?? '') && body.includes('SUMMARY:HSBC') &&
      JSON.stringify(calls.list[0]) === JSON.stringify(['u1', '2026-07-30', '2027-12-02']) && calls.touch[0] === 'u1',
    `status=${ok.status} list=${JSON.stringify(calls.list[0])}`,
  )
  calls.find.length = 0
  const bad = await handlerMod.handleFeedRequest(new Request(url('short')), deps)
  check('H2 token sai định dạng → 404, không chạm DB', bad.status === 404 && calls.find.length === 0, `status=${bad.status} find=${calls.find.length}`)
  const unknown = await handlerMod.handleFeedRequest(new Request(url('Z'.repeat(43))), deps)
  const disabled = await handlerMod.handleFeedRequest(new Request(url('C'.repeat(43))), deps)
  check(
    'H3 không có / đã tắt → 404 GIỐNG NHAU (không lộ link nào tồn tại)',
    unknown.status === 404 && disabled.status === 404 && (await unknown.text()) === (await disabled.text()),
    `${unknown.status}/${disabled.status}`,
  )
  const post = await handlerMod.handleFeedRequest(new Request(url(TOKEN), { method: 'POST' }), deps)
  check('H4 chỉ GET / HEAD → POST 405', post.status === 405, `status=${post.status}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nC — utils/calendarFeed.ts')
const cf = loadTs('src/utils/calendarFeed.ts')
if (!cf?.feedTokenFromBytes) {
  check('C0 export feedTokenFromBytes / isValidFeedToken / buildFeedUrl', false, 'chưa có')
} else {
  const tok = cf.feedTokenFromBytes(new Uint8Array(32).map((_, i) => i * 8 + 3))
  check('C1 32 byte → 43 ký tự base64url (không =, + /)', tok.length === 43 && /^[A-Za-z0-9_-]+$/.test(tok) && cf.isValidFeedToken(tok), tok)
  check('C2 isValidFeedToken từ chối độ dài / ký tự lạ', !cf.isValidFeedToken('abc') && !cf.isValidFeedToken('A'.repeat(42) + '/'), 'sai')
  check(
    'C3 buildFeedUrl: <supabase>/functions/v1/calendar-feed/<token>.ics?tz=<mã hóa>',
    cf.buildFeedUrl('https://x.supabase.co/', tok, 'Asia/Ho_Chi_Minh') ===
      `https://x.supabase.co/functions/v1/calendar-feed/${tok}.ics?tz=Asia%2FHo_Chi_Minh`,
    cf.buildFeedUrl('https://x.supabase.co/', tok, 'Asia/Ho_Chi_Minh'),
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nS — cấu trúc')
const mig = read('supabase', 'migrations', '017_calendar_feeds.sql')
check(
  'S1 migration 017: calendar_feeds (user_id PK, token UNIQUE, enabled, last_fetched_at) + RLS chủ sở hữu',
  /create table if not exists (public\.)?calendar_feeds/i.test(mig) && /user_id\s+uuid\s+primary key/i.test(mig) &&
    /token\s+text\s+not null\s+unique/i.test(mig) && /enabled/i.test(mig) && /last_fetched_at/i.test(mig) &&
    /enable row level security/i.test(mig) && /auth\.uid\(\)\s*=\s*user_id/i.test(mig),
  'migration chưa đủ',
)
const idx = read('supabase', 'functions', 'calendar-feed', 'index.ts')
check(
  'S2 index.ts: Deno.serve + service role từ env + handleFeedRequest; chỉ đọc cột cần thiết',
  /Deno\.serve/.test(idx) && /SUPABASE_SERVICE_ROLE_KEY/.test(idx) && /handleFeedRequest/.test(idx) &&
    /from\('calendar_feeds'\)/.test(idx) && /from\('calendar_events'\)/.test(idx) && /\.eq\('user_id'/.test(idx),
  'index.ts chưa đủ',
)
const svc = read('src', 'services', 'calendarFeed.service.ts')
check(
  'S3 service: đọc / tạo (upsert theo user_id) / bật-tắt calendar_feeds; token từ crypto.getRandomValues',
  /from\('calendar_feeds'\)/.test(svc) && /upsert\(/.test(svc) && /onConflict:\s*'user_id'/.test(svc) &&
    /getRandomValues/.test(svc) && /enabled/.test(svc),
  'service chưa đủ',
)
const settings = read('src', 'components', 'layout', 'SettingsModal.vue')
check(
  'S4 Settings: mục Google Calendar (chỉ khi đăng nhập), ⧉ sao chép, tạo mới có xác nhận, bật / tắt',
  /settings\.gcal\.title/.test(settings) && /v-if="auth\.isAuthenticated"[^>]*>?[\s\S]{0,200}settings\.gcal\.title|settings\.gcal\.title[\s\S]{0,200}v-if="auth\.isAuthenticated"/.test(settings) &&
    /name="copy"/.test(settings) && /settings\.gcal\.rotateConfirm/.test(settings) && /settings\.gcal\.(disable|enable)/.test(settings),
  'Settings chưa có mục',
)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const keys = ['title', 'desc', 'create', 'copy', 'copied', 'step1', 'step2', 'warnPublic', 'warnDelay', 'rotate', 'rotateConfirm', 'disable', 'enable', 'disabledHint', 'error']
const missing = keys.map((k) => `settings.gcal.${k}`).filter((k) => !vi.includes(`'${k}'`) || !en.includes(`'${k}'`))
check('S5 i18n vi + en', missing.length === 0, JSON.stringify(missing))

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/G1-google-calendar-feed.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. G1 đúng spec.')
