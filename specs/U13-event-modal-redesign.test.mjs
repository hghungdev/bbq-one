/**
 * FAILING TEST — U13: hộp thoại sự kiện (danh sách ngày + Sự kiện mới / Sửa) theo "ADN popover".
 *
 * Chạy:   node specs/U13-event-modal-redesign.test.mjs
 *
 * T — code thật `compactDateList` (utils/calendarRecurrence.ts).
 * S — cấu trúc template / CSS của CalendarEventModal (giao diện kiểm bằng ảnh Chromium, ROADMAP-U).
 * GREEN sau khi áp specs/U13-event-modal-redesign.spec.md.
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
console.log('T — compactDateList: xem trước gọn (CODE THẬT)')

const calendarDate = loadTsModule(path.join(ROOT, 'src', 'utils', 'calendarDate.ts'), {})
const R = loadTsModule(path.join(ROOT, 'src', 'utils', 'calendarRecurrence.ts'), {
  '@/utils/calendarDate': calendarDate,
})
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const days = (n) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)

if (typeof R.compactDateList !== 'function') {
  check('T0 export compactDateList', false, 'chưa có')
} else {
  check('T0 export compactDateList', true)
  check(
    'T1 ≤ 8 ngày → hiện hết, không "+n"',
    eq(R.compactDateList(days(8)), { shown: days(8), hidden: 0, last: null }) &&
      eq(R.compactDateList(days(2)), { shown: days(2), hidden: 0, last: null }),
    JSON.stringify(R.compactDateList(days(8))),
  )
  const c24 = R.compactDateList(days(24))
  check(
    'T2 24 ngày → 6 đầu + "+17" + ngày cuối (tổng vẫn 24)',
    eq(c24, { shown: days(6), hidden: 17, last: days(24)[23] }),
    JSON.stringify(c24),
  )
  const c9 = R.compactDateList(days(9))
  check(
    'T3 9 ngày → 6 đầu + "+2" + ngày cuối; max tùy chỉnh',
    eq(c9, { shown: days(6), hidden: 2, last: days(9)[8] }) &&
      eq(R.compactDateList(days(5), 4), { shown: days(2), hidden: 2, last: days(5)[4] }),
    JSON.stringify(c9),
  )
  check('T4 rỗng → rỗng', eq(R.compactDateList([]), { shown: [], hidden: 0, last: null }), 'sai')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nS — CalendarEventModal')

const modal = read('src', 'components', 'calendar', 'CalendarEventModal.vue')
const tpl = modal.slice(modal.indexOf('<template>'), modal.lastIndexOf('</template>'))
const style = modal.slice(modal.indexOf('<style'))
const script = modal.slice(0, modal.indexOf('<template>'))

check(
  'S1 Lặp lại = segmented control (radiogroup + radio + aria-checked + ← →), không còn <select>',
  !/<select\b/.test(tpl) &&
    /role="radiogroup"/.test(tpl) &&
    /role="radio"/.test(tpl) &&
    /:aria-checked=/.test(tpl) &&
    /ArrowRight/.test(script) &&
    /ArrowLeft/.test(script),
  'còn select gốc / thiếu radiogroup',
)
check(
  'S2 Số lần = bước nhảy − / + (giới hạn 2 … trần), hiện ngày kết thúc',
  /stepRepeat\(-1\)/.test(tpl) &&
    /stepRepeat\(1\)/.test(tpl) &&
    /repeatCount <= 2/.test(tpl) &&
    /repeatCount >= repeatMax/.test(tpl) &&
    /calendar\.repeat\.until/.test(tpl),
  'thiếu stepper / ngày kết thúc',
)
check(
  'S3 Xem trước = chip ngày (compactDateList), ngày bị bỏ qua đánh dấu riêng',
  /compactDateList\(/.test(script) &&
    /cal-form__chip--skip/.test(tpl) &&
    /calendar\.repeat\.previewCount/.test(tpl) &&
    !/repeatPreview/.test(modal),
  'xem trước vẫn là một câu dài',
)
// U15 (đổi có chủ đích): "Xóa" ở chân Sửa sự kiện từ nút chữ đỏ → icon 🗑 (giống danh sách ngày).
check(
  'S4 Chân: "Lưu" = ds-primary (đếm "Tạo n sự kiện" khi lặp); ‹ về danh sách (U19); sửa có 🗑 (U15)',
  /class="ds-primary[^"]*"[^>]*type="submit"|type="submit"[^>]*class="ds-primary/.test(tpl) &&
    /calendar\.repeat\.saveN/.test(tpl) &&
    // U19 (đổi có chủ đích): bỏ "Hủy" ở chân — về danh sách bằng ‹ ở đầu tiêu đề.
    /@click="cancelForm"[\s\S]{0,80}name="chevron-left"/.test(tpl) &&
    /ds-icon-action--danger[\s\S]{0,300}requestDeleteActive[\s\S]{0,80}name="trash"/.test(tpl),
  'chân hộp thoại chưa theo ADN',
)
check(
  'S5 Không hộp lồng hộp: chỉ bề mặt hộp thoại có viền; bỏ nền gradient',
  (style.match(/border:\s*1px solid var\(--border\)/g) || []).length <= 1 &&
    !/radial-gradient/.test(style) &&
    !/class="cal-modal__field"/.test(tpl) &&
    !/cal-modal__form-actions/.test(modal),
  'còn khung quanh trường / chân',
)
check(
  'S6 Danh sách ngày: SectionHeader "SỰ KIỆN · n/max" + ＋ icon (U15); dòng ds-row có vạch màu; 🗑 ds-icon-action',
  /<SectionHeader[\s\S]{0,300}calendar\.modal\.section\.events/.test(tpl) &&
    /CALENDAR_MAX_EVENTS_PER_DAY/.test(tpl) &&
    // U15 (đổi có chủ đích): "＋ Thêm sự kiện" từ nút chữ → icon ＋ (giống đầu mục Ghi chú).
    /ds-icon-action--accent[\s\S]{0,250}startCreate[\s\S]{0,80}name="plus"/.test(tpl) &&
    /class="cal-modal__row ds-row"/.test(tpl) &&
    /cal-modal__swatch/.test(tpl) &&
    /var\(--cal-event-rail\)/.test(style) &&
    !/<IconDeleteButton/.test(tpl) &&
    !/cal-modal__toolbar/.test(modal),
  'danh sách ngày chưa theo ADN',
)
check(
  'S7 Mở form → focus ô tiêu đề; bộ đếm ký tự n/64',
  /titleInputRef\.value\?\.focus\(\)/.test(script) &&
    /formTitle\.length[\s\S]{0,40}CALENDAR_TITLE_MAX/.test(tpl),
  'chưa focus / chưa có bộ đếm',
)
check(
  'S8 Tiêu đề: danh sách = ngày đủ thứ; form có dòng ngày phụ',
  /weekday: 'long'/.test(script) && !/calendar\.modal\.title\.list/.test(modal) && /cal-modal__subtitle/.test(tpl),
  'tiêu đề chưa đổi',
)

const css = read('src', 'assets', 'styles', 'calendar-events.css')
check(
  'S9 calendar-events.css: bỏ khối .cal-modal__row.cal-event-tone-* (vạch màu vẽ bằng phần tử con)',
  !/\.cal-modal__row\.cal-event-tone-/.test(css),
  'còn khối cũ',
)

const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const keys = [
  'calendar.modal.section.events',
  'calendar.repeat.previewCount',
  'calendar.repeat.until',
  'calendar.repeat.saveN',
  'calendar.repeat.decrease',
  'calendar.repeat.increase',
  'calendar.repeat.skipChip',
  'calendar.repeat.moreDates',
]
const missing = keys.filter((k) => !vi.includes(`'${k}'`) || !en.includes(`'${k}'`))
check(
  'S10 i18n vi + en: khóa mới; "Một lần" / "Once"; gỡ calendar.modal.title.list',
  missing.length === 0 &&
    vi.includes("'calendar.repeat.none': 'Một lần'") &&
    en.includes("'calendar.repeat.none': 'Once'") &&
    !vi.includes("'calendar.modal.title.list'") &&
    !en.includes("'calendar.modal.title.list'"),
  `thiếu: ${JSON.stringify(missing)}`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U13-event-modal-redesign.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U13 đúng spec.')
