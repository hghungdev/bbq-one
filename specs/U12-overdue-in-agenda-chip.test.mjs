/**
 * FAILING TEST — U12: "Quá hạn" là nhóm thông báo thứ hai trong chip; bỏ hộp thoại tự bật.
 *
 * Chạy:   node specs/U12-overdue-in-agenda-chip.test.mjs
 * GREEN sau khi áp specs/U12-overdue-in-agenda-chip.spec.md.
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
function loadTs(rel, mocks = {}) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const req = (s) => {
    if (s in mocks) return mocks[s]
    throw new Error(`Unmocked import in ${path.basename(rel)}: ${s}`)
  }
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports)
  return mod.exports
}
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}

console.log('U12 — Quá hạn trong chip')
const { buildAgenda, agendaChip } = loadTs('src/utils/calendarAgenda.ts')
const ev = (id, date, title, position = 1) => ({
  id, event_date: date, title, position, is_done: false, color: null, start_time: null, end_time: null,
})
const T = '2026-10-28'
const M = '2026-10-29'
const overdue = [
  ev('o1', '2026-10-20', 'Shinhan', 1), ev('o2', '2026-10-20', 'Claude', 2),
  ev('o3', '2026-10-26', 'SPLayer'), ev('o4', '2026-10-27', 'UOB'), ev('o5', '2026-10-27', 'OT', 2),
]
const today = { [T]: [ev('t1', T, 'HSBC T1279')] }
const none = () => []

const a = buildAgenda((k) => today[k] ?? [], T, M, null, overdue)
check(
  'U12.1 agenda.overdue: tổng số + 3 mục đầu (giữ thứ tự, kèm ngày)',
  a.overdue?.count === 5 &&
    JSON.stringify(a.overdue.items.map((i) => [i.title, i.dateKey])) ===
      JSON.stringify([['Shinhan', '2026-10-20'], ['Claude', '2026-10-20'], ['SPLayer', '2026-10-26']]),
  JSON.stringify(a.overdue),
)
const chipWithToday = agendaChip(a)
check(
  'U12.2 có hôm nay → chip vẫn hiện hôm nay, thêm overdueCount = 5',
  chipWithToday?.tone === 'today' && chipWithToday.overdueCount === 5,
  JSON.stringify(chipWithToday),
)
const onlyOverdue = agendaChip(buildAgenda(none, T, M, null, overdue))
check(
  'U12.3 chỉ có quá hạn → tone "overdue"',
  onlyOverdue?.tone === 'overdue' && onlyOverdue.overdueCount === 5,
  JSON.stringify(onlyOverdue),
)
check(
  'U12.4 không quá hạn → overdue = null; không gì cả → chip null (như cũ, gọi 4 tham số vẫn chạy)',
  buildAgenda(none, T, M, null).overdue === null && agendaChip(buildAgenda(none, T, M, null)) === null,
  'sai',
)

const chip = read('src', 'components', 'calendar', 'CalendarAgendaChip.vue')
check(
  'U12.5 chip lấy quá hạn từ store (listOverdueIncompleteEvents) + mục QUÁ HẠN + emit review-overdue',
  chip.includes('listOverdueIncompleteEvents(') &&
    chip.includes("t('calendar.agenda.overdue')") &&
    /emit\('review-overdue'\)/.test(chip),
  'chip chưa có nhóm Quá hạn',
)
const app = read('src', 'pages', 'App.vue')
check(
  'U12.6 App: không còn hộp thoại tự bật; chip mở hộp thoại qua @review-overdue',
  !app.includes('maybeShowOverdueReminder') &&
    !app.includes('isOverdueReminderDismissed') &&
    /@review-overdue="[^"]*showOverdueReminder = true/.test(app),
  'còn tự bật / chưa nối chip',
)
const svc = read('src', 'services', 'calendarOverdueReminder.service.ts')
const auth = read('src', 'stores', 'auth.ts')
check(
  'U12.7 gỡ cờ "đã ẩn trong phiên" (service + auth) — không còn ai dùng',
  !/OverdueReminderDismiss/.test(svc) && !auth.includes('clearOverdueReminderDismiss') && !read('src', 'constants', 'storage.ts').includes('CALENDAR_OVERDUE_REMINDER_DISMISSED'),
  'còn code cờ ẩn',
)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const keys = ['overdue', 'overdueCount', 'overdueShort', 'overdueMore', 'reviewOverdue'].map((k) => `calendar.agenda.${k}`)
const missing = keys.filter((k) => !vi.includes(`'${k}'`) || !en.includes(`'${k}'`))
check('U12.8 i18n vi + en', missing.length === 0, JSON.stringify(missing))

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U12 đúng spec.')
