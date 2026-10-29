/**
 * FAILING TEST — U18: chip lịch hiện tên TRỌN VẸN vừa chỗ + "+n" (không cắt giữa tên).
 *
 * Chạy:   node specs/U18-agenda-chip-fit-titles.test.mjs
 * GREEN sau khi áp specs/U18-agenda-chip-fit-titles.spec.md.
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

function loadTsModule(filePath) {
  const js = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)(() => ({}), mod, mod.exports)
  return mod.exports
}

// U30 (đổi có chủ đích): Sir — ngày 5–6 sự kiện chip không được gom một phần + "+n". Bỏ fitTitleCount; giờ
// mọi tên vừa chỗ → hiện đủ, không vừa hết → ghi số ("6 sự kiện"). Các ca đo chỗ trống giữ nguyên ý.
// U36 (đổi có chủ đích): chip ghi SỐ từ 2 sự kiện (Sir chọn "chip ghi số") — không còn đo chỗ trống.
console.log('T — chipUsesCount (CODE THẬT, U36 thay titlesNeedCount)')
const A = loadTsModule(path.join(ROOT, 'src', 'utils', 'calendarAgenda.ts'))
if (typeof A.chipUsesCount !== 'function') {
  check('T0 export chipUsesCount', false, 'chưa có')
} else {
  const f = A.chipUsesCount
  check('T1 2 tên → ghi số', f(2) === true, String(f(2)))
  check('T2 không còn bớt tên + "+n" — nhiều tên → ghi số', f(4) === true, String(f(4)))
  check('T3 3 tên → ghi số', f(3) === true, String(f(3)))
  check('T4 bỏ titlesNeedCount / fitTitleCount', !('titlesNeedCount' in A) && !('fitTitleCount' in A), 'còn hàm cũ')
  check('T5 một tên → vẫn hiện tên (cắt "…")', f(1) === false, String(f(1)))
  check('T6 không có tên → không ghi số', f(0) === false, String(f(0)))
}

console.log('\nS — CalendarAgendaChip')
const chip = fs.readFileSync(path.join(ROOT, 'src', 'components', 'calendar', 'CalendarAgendaChip.vue'), 'utf8')
const tpl = chip.slice(chip.indexOf('<template>'), chip.lastIndexOf('</template>'))
const script = chip.slice(0, chip.indexOf('<template>'))
const trigger = (/<button\s+ref="triggerRef"[\s\S]*?<\/button>/.exec(tpl) ?? [''])[0]
check(
  'S1 chip ghi số theo chipUsesCount, không đo chữ (U36, đổi có chủ đích)',
  /chipUsesCount\(/.test(script) && !/measureText\(|ResizeObserver/.test(script),
  'còn đo chữ',
)
check(
  'S2 vùng tên vẽ shownTitles: đủ tên hoặc số sự kiện — hết viên "+n" (U30, đổi có chủ đích)',
  /class="agenda-chip__titles"[^>]*>\s*\{\{\s*shownTitles\s*\}\}/.test(trigger) && !/agenda-chip__plus|hiddenCount/.test(trigger) &&
    /calendar\.agenda\.eventCount/.test(script),
  'vẫn gom "+n"',
)
check(
  'S3 tooltip + aria-label vẫn đọc ĐỦ mọi tên (chipTitles)',
  /:title="[^"]*chipTitles/.test(trigger) && /list:[^}]*chipTitles/.test(trigger),
  'mất danh sách đầy đủ',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U18-agenda-chip-fit-titles.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U18 đúng spec.')
