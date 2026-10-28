/**
 * FAILING TEST — U14: đánh dấu xong TỪNG việc quá hạn ngay trong bảng "Lịch sắp tới".
 *
 * Chạy:   node specs/U14-overdue-mark-one.test.mjs
 *
 * T — code thật `overduePanelRows` (utils/calendarAgenda.ts).
 * S — cấu trúc CalendarAgendaChip.vue + i18n.
 * GREEN sau khi áp specs/U14-overdue-mark-one.spec.md.
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

function loadTsModule(filePath, mocks = {}) {
  const src = fs.readFileSync(filePath, 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const requireShim = (spec) => {
    if (spec in mocks) return mocks[spec]
    throw new Error(`Unmocked import in ${path.basename(filePath)}: ${spec}`)
  }
  new Function('require', 'module', 'exports', js)(requireShim, mod, mod.exports)
  return mod.exports
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('T — overduePanelRows (CODE THẬT)')

const A = loadTsModule(path.join(ROOT, 'src', 'utils', 'calendarAgenda.ts'), {})
const ev = (id, date, title, done = false) => ({
  id,
  event_date: date,
  title,
  position: 1,
  is_done: done,
  color: null,
  start_time: null,
  end_time: null,
})

if (typeof A.overduePanelRows !== 'function') {
  check('T0 export overduePanelRows', false, 'chưa có')
} else {
  check('T0 export overduePanelRows', true)
  const events = [
    ev('c', '2026-10-26', 'SPLayer'),
    ev('a', '2026-10-20', 'Shinhan'),
    ev('b', '2026-10-20', 'Claude', true),
    ev('x', '2026-10-21', 'Không trong danh sách'),
  ]
  const rows = A.overduePanelRows(['a', 'b', 'c'], events)
  check(
    'T1 giữ đúng thứ tự id lúc mở bảng; việc vừa xong vẫn ở chỗ cũ, done = true',
    JSON.stringify(rows.map((r) => [r.id, r.title, r.dateKey, r.done])) ===
      JSON.stringify([
        ['a', 'Shinhan', '2026-10-20', false],
        ['b', 'Claude', '2026-10-20', true],
        ['c', 'SPLayer', '2026-10-26', false],
      ]),
    JSON.stringify(rows),
  )
  check(
    'T2 id đã bị xóa / tiêu đề rỗng → bỏ qua (không vỡ)',
    A.overduePanelRows(['gone', 'a'], events).map((r) => r.id).join() === 'a' &&
      A.overduePanelRows(['e'], [ev('e', '2026-10-20', '   ')]).length === 0,
    'sai',
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nS — CalendarAgendaChip + i18n')

const chip = read('src', 'components', 'calendar', 'CalendarAgendaChip.vue')
const tpl = chip.slice(chip.indexOf('<template>'), chip.lastIndexOf('</template>'))
const script = chip.slice(0, chip.indexOf('<template>'))

check(
  'S1 chụp id quá hạn khi mở bảng (overdueShownIds) → dòng không nhảy khi đánh dấu',
  /overdueShownIds/.test(script) && /overduePanelRows\(/.test(script) && /v-for="item in overdueRows"/.test(tpl),
  'chưa giữ danh sách cố định',
)
check(
  'S2 nút ✓ từng dòng: aria-pressed, xong = markEventsDone([id]), bấm lại = toggleDone (hoàn tác)',
  /class="agenda-chip__check"/.test(tpl) &&
    /:aria-pressed="item\.done"/.test(tpl) &&
    /calendar\.markEventsDone\(\[/.test(script) &&
    /calendar\.toggleDone\(/.test(script) &&
    /calendar\.agenda\.markOneDone/.test(tpl),
  'chưa có nút ✓ từng dòng',
)
check(
  'S3 mục Quá hạn vẫn hiện khi vừa xong hết (để hoàn tác); "Xem tất cả" ẩn khi không còn việc',
  /<section v-if="overdueRows\.length > 0"/.test(tpl) && /v-if="overdueOpenCount > 0"[^>]*@click="reviewOverdue"|@click="reviewOverdue"[^>]*v-if="overdueOpenCount > 0"/.test(tpl.replace(/\s+/g, ' ')),
  'mục biến mất / nút vẫn hiện khi 0',
)
check(
  'S4 "và n việc khác" = số việc chưa xong ngoài các dòng đang hiện',
  /overdueMoreCount/.test(script) && /overdueMoreCount > 0/.test(tpl),
  'chưa tính lại',
)
check(
  'S5 không dùng undo-toast chung (gắn hàng đợi xóa của service worker)',
  !/useUndoToastStore|undoToast/.test(chip),
  'đang dùng undo-toast',
)

const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
check(
  'S6 i18n: "Xem tất cả" / "Review all" (hết hiểu nhầm "đánh dấu tất cả"); markOneDone / markOneUndo',
  vi.includes("'calendar.agenda.reviewOverdue': 'Xem tất cả'") &&
    en.includes("'calendar.agenda.reviewOverdue': 'Review all'") &&
    ['calendar.agenda.markOneDone', 'calendar.agenda.markOneUndo'].every((k) => vi.includes(`'${k}'`) && en.includes(`'${k}'`)),
  'i18n chưa đổi',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U14-overdue-mark-one.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U14 đúng spec.')
