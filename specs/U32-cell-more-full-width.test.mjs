/**
 * FAILING TEST — U32: thẻ "+n xem thêm" trong ô lịch rộng bằng pill sự kiện (cùng bo góc, lề chữ), viền đứt.
 *
 * Chạy:   node specs/U32-cell-more-full-width.test.mjs
 * GREEN sau khi áp specs/U32-cell-more-full-width.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}

const cell = fs.readFileSync(path.join(ROOT, 'src', 'components', 'calendar', 'CalendarCell.vue'), 'utf8')
const rule = (sel) => (new RegExp(`\\n${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`).exec(cell) ?? ['', ''])[1]
const prop = (css, name) => (new RegExp(`(?:^|\\n)\\s*${name}:\\s*([^;]+);`).exec(css) ?? [])[1]?.trim()

const pill = rule('.cal-cell__event')
const row = rule('.cal-cell__more-row')
const more = rule('.cal-cell__more')

console.log('T — thẻ "+n xem thêm" là một dòng của danh sách')
check(
  'U32.1 rộng hết cột như pill (dòng flex, nút giãn hết, không max-width ôm chữ)',
  prop(row, 'display') === 'flex' && prop(more, 'flex') === '1 1 auto' && prop(more, 'min-width') === '0' && !prop(more, 'max-width'),
  `row display=${prop(row, 'display')} · flex=${prop(more, 'flex')} · max-width=${prop(more, 'max-width')}`,
)
check(
  'U32.2 cùng bo góc + lề ngang với pill (chữ thẳng cột tên sự kiện), canh trái',
  prop(more, 'border-radius') === prop(pill, 'border-radius') && /^\d+px 8px$/.test(prop(more, 'padding') ?? '') &&
    /8px$/.test(prop(pill, 'padding') ?? '') && prop(more, 'text-align') === 'left',
  `radius ${prop(more, 'border-radius')} vs ${prop(pill, 'border-radius')} · padding ${prop(more, 'padding')} · align ${prop(more, 'text-align')}`,
)
check(
  'U32.3 vẫn là nút phụ: viền đứt, nền trong, thấp hơn pill (24 px < 28 px)',
  /^1px dashed /.test(prop(more, 'border') ?? '') && prop(more, 'background') === 'transparent' &&
    prop(more, 'min-height') === '24px' && prop(pill, 'min-height') === '28px',
  `border ${prop(more, 'border')} · bg ${prop(more, 'background')} · min-height ${prop(more, 'min-height')}`,
)
check(
  'U32.4 cỡ chữ như pill (--font-size-sm), cắt "…" khi hẹp',
  prop(more, 'font-size') === 'var(--font-size-sm)' && prop(more, 'text-overflow') === 'ellipsis' && prop(more, 'white-space') === 'nowrap',
  `font-size ${prop(more, 'font-size')}`,
)
check(
  'U32.5 hành vi U30 giữ nguyên: nút gọi onMoreClick, tooltip moreTitle',
  /class="cal-cell__more"[\s\S]{0,200}@click="onMoreClick\(\$event\)"/.test(cell) && /calendar\.cell\.moreTitle/.test(cell),
  'mất hành vi U30',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U32-cell-more-full-width.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U32 đúng spec.')
