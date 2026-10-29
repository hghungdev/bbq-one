/**
 * FAILING TEST — U36: chip lịch trên header luôn ghi SỐ sự kiện khi ngày có từ 2 sự kiện (1 sự kiện → tên).
 *
 * Chạy:   node specs/U36-chip-count-always.test.mjs
 * GREEN sau khi áp specs/U36-chip-count-always.spec.md.
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
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
function load(rel) {
  const js = ts.transpileModule(read(...rel.split('/')), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)(() => ({}), mod, mod.exports)
  return mod.exports
}

console.log('T1 — quy tắc (CODE THẬT)')
const A = load('src/utils/calendarAgenda.ts')
const f = A.chipUsesCount
check(
  'U36.1 chipUsesCount: 0 / 1 → hiện tên; 2, 5, 6 → ghi số',
  typeof f === 'function' && f(0) === false && f(1) === false && f(2) === true && f(5) === true && f(6) === true,
  typeof f === 'function' ? [0, 1, 2, 5, 6].map((n) => f(n)).join(',') : 'chưa có',
)
check('U36.2 bỏ titlesNeedCount (không còn kiểu lai theo bề rộng)', !('titlesNeedCount' in A), 'còn titlesNeedCount')

console.log('\nT2 — chip')
const chip = read('src', 'components', 'calendar', 'CalendarAgendaChip.vue')
const script = chip.slice(0, chip.indexOf('<template>'))
const tpl = chip.slice(chip.indexOf('<template>'), chip.lastIndexOf('</template>'))
const trigger = (/<button\s+ref="triggerRef"[\s\S]*?<\/button>/.exec(tpl) ?? [''])[0]
check(
  'U36.3 shownTitles theo chipUsesCount(listTitles.length) → calendar.agenda.eventCount',
  /chipUsesCount\(listTitles\.value\.length\)[\s\S]{0,120}t\('calendar\.agenda\.eventCount', \{ n: listTitles\.value\.length \}\)/.test(script),
  'chưa theo số sự kiện',
)
check(
  'U36.4 bỏ phần đo chữ: không measureText / canvas / ResizeObserver / fonts.ready / titlesRef',
  !/measureText|getContext\('2d'\)|ResizeObserver|fonts\?\.ready|titlesRef|measureTitles|scheduleMeasure/.test(chip),
  'còn đo chữ',
)
check(
  'U36.5 tooltip + aria-label vẫn đọc đủ mọi tên (chipTitles)',
  /:title="[^"]*chipTitles/.test(trigger) && /list:[^}]*chipTitles/.test(trigger) && /\{\{ shownTitles \}\}/.test(trigger),
  'mất danh sách đầy đủ',
)

console.log('\nT3 — tài liệu 2.0.1')
const readme = read('README.md')
const sec = readme.slice(readme.indexOf('## What changed in 2.0.1'), readme.indexOf('## What changed in 2.0.0'))
const txt = read('docs', 'chrome-store-detailed-description.txt')
check(
  'U36.6 README + mô tả Store: chip ghi số sự kiện (hết "every title when they fit" / "every title or the count")',
  /header chip shows how many events/.test(sec) && !/every title when they fit/.test(sec) &&
    /header chip shows how many events/.test(txt) && !/every title or the count/.test(txt),
  'tài liệu còn kiểu lai',
)
check('U36.7 phiên bản giữ 2.0.1 (chưa upload Store)', JSON.parse(read('public', 'manifest.json')).version === '2.0.1', 'đổi phiên bản')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U36-chip-count-always.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U36 đúng spec.')
