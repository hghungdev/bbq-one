/**
 * FAILING TEST — U7: hộp thoại "Sự kiện đã qua hạn" chọn hàng loạt.
 *
 * Chạy:   node specs/U7-overdue-bulk-select.test.mjs
 *
 * RED trên 6c1cbbe: chỉ có checkbox từng mục; chưa có chọn tất cả / chọn cả ngày / Shift-chọn
 * liên tiếp; nút xác nhận không ghi số lượng.
 * GREEN sau khi áp specs/U7-overdue-bulk-select.spec.md.
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

const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return null
  }
}
const sorted = (set) => JSON.stringify([...set].sort())

console.log('U7 — chọn hàng loạt trong hộp thoại "Sự kiện đã qua hạn"')

let sel = null
try {
  sel = loadTsModule(path.join(ROOT, 'src', 'utils', 'bulkSelection.ts'))
} catch (e) {
  check('U7.1 utils/bulkSelection.ts load được', false, e.message)
}
if (sel) {
  const { selectionState, toggleMany, selectRange } = sel
  const all = ['a', 'b', 'c', 'd', 'e']
  check(
    'U7.1 selectionState: none / some / all; danh sách rỗng = none',
    selectionState(all, new Set()) === 'none' &&
      selectionState(all, new Set(['b'])) === 'some' &&
      selectionState(all, new Set(all)) === 'all' &&
      selectionState(['a', 'b'], new Set(['a', 'b', 'z'])) === 'all' &&
      selectionState([], new Set(['a'])) === 'none',
    'sai trạng thái',
  )
  const before = new Set(['z'])
  const on = toggleMany(['a', 'b'], before)
  const off = toggleMany(['a', 'b'], new Set(['a', 'b', 'z']))
  const partial = toggleMany(['a', 'b'], new Set(['a']))
  check(
    'U7.2 toggleMany: chưa đủ → chọn hết; đủ → bỏ; giữ mục ngoài nhóm; không sửa Set cũ',
    sorted(on) === sorted(['a', 'b', 'z']) &&
      sorted(off) === sorted(['z']) &&
      sorted(partial) === sorted(['a', 'b']) &&
      sorted(before) === sorted(['z']),
    `on=${sorted(on)} off=${sorted(off)} partial=${sorted(partial)}`,
  )
  const fwd = selectRange(all, 'b', 'd', true, new Set())
  const back = selectRange(all, 'd', 'a', true, new Set(['e']))
  const clear = selectRange(all, 'a', 'c', false, new Set(all))
  const noAnchor = selectRange(all, 'gone', 'c', true, new Set())
  check(
    'U7.3 selectRange: hai chiều, đặt đúng checked, giữ mục ngoài khoảng, anchor mất → chỉ target',
    sorted(fwd) === sorted(['b', 'c', 'd']) &&
      sorted(back) === sorted(['a', 'b', 'c', 'd', 'e']) &&
      sorted(clear) === sorted(['d', 'e']) &&
      sorted(noAnchor) === sorted(['c']),
    `fwd=${sorted(fwd)} back=${sorted(back)} clear=${sorted(clear)} noAnchor=${sorted(noAnchor)}`,
  )
}

const dlg = read('src', 'components', 'calendar', 'CalendarOverdueReminderDialog.vue') ?? ''
check(
  'U7.4 thanh "Chọn tất cả" (indeterminate khi chọn một phần) + đếm đã chọn',
  dlg.includes("t('calendar.overdue.selectAll')") &&
    /:indeterminate="[^"]*'some'/.test(dlg) &&
    dlg.includes("t('calendar.overdue.selectedCount'"),
  'thiếu thanh chọn tất cả',
)
check(
  'U7.5 tiêu đề ngày có checkbox chọn cả ngày (toggleMany)',
  dlg.includes("t('calendar.overdue.selectDay'") && /toggleMany\(/.test(dlg) && (dlg.match(/:indeterminate=/g) ?? []).length >= 2,
  'chưa chọn được cả ngày',
)
check(
  'U7.6 Shift + bấm chọn liên tiếp (selectRange + shiftKey); cả hàng là <label>',
  dlg.includes('selectRange(') && dlg.includes('shiftKey') && /<label[^>]*class="cal-overdue__row/.test(dlg),
  'thiếu chọn liên tiếp / hàng chưa bấm được',
)
check(
  'U7.7 Ctrl/⌘+A chọn hết; mở hộp thoại focus "Chọn tất cả"',
  /e\.ctrlKey \|\| e\.metaKey/.test(dlg) && /key\.toLowerCase\(\) === 'a'/.test(dlg) && /\.focus\(\)/.test(dlg),
  'thiếu phím tắt / focus',
)
check(
  'U7.8 nút chính ghi số lượng, mờ khi chưa chọn',
  dlg.includes("t('calendar.overdue.btnConfirmCount'") && /:disabled="[^"]*selectedCount === 0/.test(dlg),
  'nút xác nhận chưa ghi số / chưa mờ',
)

const viSrc = read('src', 'i18n', 'vi.ts') ?? ''
const enSrc = read('src', 'i18n', 'en.ts') ?? ''
const keys = ['selectAll', 'selectedCount', 'selectDay', 'btnConfirmCount', 'tip'].map((k) => `calendar.overdue.${k}`)
const missing = keys.filter((k) => !viSrc.includes(`'${k}'`) || !enSrc.includes(`'${k}'`))
check('U7.9 i18n vi + en', missing.length === 0, `thiếu: ${JSON.stringify(missing)}`)
check(
  'U7.10 gỡ calendar.overdue.btnConfirm cũ (không còn ai dùng)',
  !viSrc.includes("'calendar.overdue.btnConfirm'") && !enSrc.includes("'calendar.overdue.btnConfirm'"),
  'khóa i18n mồ côi',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U7-overdue-bulk-select.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U7 đúng spec.')
