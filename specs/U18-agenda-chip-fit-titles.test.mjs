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

console.log('T — fitTitleCount (CODE THẬT)')
const A = loadTsModule(path.join(ROOT, 'src', 'utils', 'calendarAgenda.ts'))
const more = (n) => 20 + String(n).length * 6 // "+n" + lề
if (typeof A.fitTitleCount !== 'function') {
  check('T0 export fitTitleCount', false, 'chưa có')
} else {
  const f = A.fitTitleCount
  check('T1 đủ chỗ cho mọi tên → hiện hết, không "+n"', f([60, 70], 200, 10, more) === 2, String(f([60, 70], 200, 10, more)))
  // 2 tên cần 60+10+70 = 140; chỉ có 120 → 1 tên + "+1" (60 + 26 = 86 ≤ 120)
  check('T2 thiếu chỗ → bớt tên cuối, chừa chỗ cho "+n"', f([60, 70], 120, 10, more) === 1, String(f([60, 70], 120, 10, more)))
  // 3 tên: [40, 40, 40], sep 10. 3 tên = 140 > 130 → thử 2 tên + "+1": 90 + 26 = 116 ≤ 130 → 2
  check('T3 chừa chỗ "+n" đúng: 3 tên không vừa → 2 tên + "+1"', f([40, 40, 40], 130, 10, more) === 2, String(f([40, 40, 40], 130, 10, more)))
  // 2 tên vừa khít KHÔNG cần "+n": 40+10+40 = 90 ≤ 90 → 2 (không bị trừ chỗ "+n" khi không cần)
  check('T4 vừa khít mọi tên → không trừ chỗ cho "+n"', f([40, 40], 90, 10, more) === 2, String(f([40, 40], 90, 10, more)))
  check('T5 tên đầu dài hơn chỗ → vẫn 1 (tên đầu được cắt "…")', f([400, 50], 120, 10, more) === 1, String(f([400, 50], 120, 10, more)))
  check('T6 không có tên → 0', f([], 120, 10, more) === 0, String(f([], 120, 10, more)))
}

console.log('\nS — CalendarAgendaChip')
const chip = fs.readFileSync(path.join(ROOT, 'src', 'components', 'calendar', 'CalendarAgendaChip.vue'), 'utf8')
const tpl = chip.slice(chip.indexOf('<template>'), chip.lastIndexOf('</template>'))
const script = chip.slice(0, chip.indexOf('<template>'))
const trigger = (/<button\s+ref="triggerRef"[\s\S]*?<\/button>/.exec(tpl) ?? [''])[0]
check(
  'S1 đo chữ thật (measureText) + chỗ trống thật (ResizeObserver) → fitTitleCount',
  /fitTitleCount\(/.test(script) && /measureText\(/.test(script) && /ResizeObserver/.test(script),
  'chưa đo',
)
check(
  'S2 vùng tên chỉ vẽ các tên vừa chỗ + viên "+n"',
  /class="agenda-chip__titles"[^>]*>\s*\{\{\s*shownTitles\s*\}\}/.test(trigger) && /agenda-chip__plus/.test(trigger) && /hiddenCount/.test(trigger),
  'vẫn vẽ cả danh sách để CSS cắt',
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
