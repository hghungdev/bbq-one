/**
 * FAILING TEST — U34: header hết bề ngang, logo sát mép trái (cùng trục cột icon), thanh dọc nằm dưới header.
 *
 * Chạy:   node specs/U34-header-full-width.test.mjs
 * GREEN sau khi áp specs/U34-header-full-width.spec.md.
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

const app = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const tpl = app.slice(app.indexOf('<template>'), app.lastIndexOf('</template>'))
const css = app.slice(app.indexOf('<style'))
const rule = (sel) => (new RegExp(`\\n  ${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`).exec(css) ?? ['', ''])[1]
const prop = (block, name) => (new RegExp(`(?:^|\\n)\\s*${name}:\\s*([^;]+);`).exec(block) ?? [])[1]?.trim()

console.log('T1 — khung')
const iHeader = tpl.indexOf('<header class="shell__header"')
const iBody = tpl.indexOf('<div class="shell__body">')
const iRail = tpl.indexOf('<nav class="shell__rail"')
const iMain = tpl.indexOf('<div class="shell__main">')
const iHeaderEnd = tpl.indexOf('</header>')
check(
  'U34.1 header là con đầu của .shell (trước shell__body); shell__body chứa thanh dọc rồi cột nội dung',
  iHeader > 0 && iHeaderEnd < iBody && iBody < iRail && iRail < iMain && tpl.indexOf('class="shell__main"') > iRail &&
    !tpl.slice(iMain, tpl.indexOf('<SettingsModal')).includes('<header'),
  `header ${iHeader} · body ${iBody} · rail ${iRail} · main ${iMain}`,
)
check(
  'U34.2 CSS: .shell xếp cột; .shell__body là hàng giãn hết phần còn lại',
  prop(rule('.shell'), 'flex-direction') === 'column' && prop(rule('.shell__body'), 'display') === 'flex' &&
    prop(rule('.shell__body'), 'flex-direction') === 'row' && prop(rule('.shell__body'), 'flex') === '1 1 auto' &&
    prop(rule('.shell__body'), 'min-height') === '0',
  `shell ${prop(rule('.shell'), 'flex-direction')} · body ${JSON.stringify(rule('.shell__body'))}`,
)

console.log('\nT2 — logo cùng trục cột icon')
const pad = (prop(rule('.shell__header'), 'padding') ?? '').split(/\s+/)
const padLeft = pad.length === 4 ? pad[3] : pad.length >= 2 ? pad[1] : pad[0]
check(
  'U34.3 header lề trái 12 px + logo 32 px → tâm 28 px = giữa thanh dọc 56 px',
  padLeft === '12px' && prop(rule('.shell__brand-logo'), 'width') === '32px' && prop(rule('.shell__rail'), 'flex') === '0 0 56px',
  `padding ${prop(rule('.shell__header'), 'padding')}`,
)

console.log('\nT3 — header đè lên thanh dọc')
const hz = Number(prop(rule('.shell__header'), 'z-index'))
const rz = Number(prop(rule('.shell__rail'), 'z-index'))
check(
  'U34.4 header position: relative + z-index > thanh dọc (thanh dọc vẫn > nội dung cho tooltip U28)',
  prop(rule('.shell__header'), 'position') === 'relative' && hz > rz && rz >= 20,
  `header z ${hz} · rail z ${rz}`,
)
check(
  'U34.5 giữ nguyên: logo + tên, chip lịch, ☀ › ⚙ › tài khoản trong header; ☁ đáy thanh dọc',
  /class="shell__brand-logo"/.test(tpl.slice(iHeader, iHeaderEnd)) && /<CalendarAgendaChip/.test(tpl.slice(iHeader, iHeaderEnd)) &&
    /<ThemeModeToggle[\s\S]*name="settings"[\s\S]*<AccountMenu/.test(tpl.slice(iHeader, iHeaderEnd)) &&
    /class="shell__rail-bottom"/.test(tpl.slice(iRail, iMain)),
  'header / thanh dọc bị đổi nội dung',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U34-header-full-width.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U34 đúng spec.')
