/**
 * FAILING TEST — U20: thanh điều hướng dọc (rail) thay 3 tab trên header.
 *
 * Chạy:   node specs/U20-navigation-rail.test.mjs
 * GREEN sau khi áp specs/U20-navigation-rail.spec.md.
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
const script = app.slice(0, app.indexOf('<template>'))
const icons = fs.readFileSync(path.join(ROOT, 'src', 'components', 'ui', 'icons.ts'), 'utf8')
const vi = fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'vi.ts'), 'utf8')
const en = fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'en.ts'), 'utf8')

const rail = (/<nav\b[^>]*class="shell__rail"[\s\S]*?<\/nav>/.exec(tpl) ?? [''])[0]
const header = (/<header class="shell__header"[\s\S]*?<\/header>/.exec(tpl) ?? [''])[0]
const drawer = (/<div\b[^>]*class="shell__drawer"[\s\S]*?<!-- \/drawer -->/.exec(tpl) ?? [''])[0]

console.log('U20 — thanh điều hướng dọc')
check(
  'U20.1 thanh dọc đứng trước cột nội dung (shell__rail → shell__main)',
  rail !== '' && tpl.indexOf('class="shell__rail"') < tpl.indexOf('class="shell__main"'),
  'chưa có shell__rail / shell__main',
)
check(
  'U20.2 3 mục = tablist DỌC, chỉ icon (aria-label + tooltip theo tên mục)',
  /role="tablist"/.test(rail) && /aria-orientation="vertical"/.test(rail) && /v-for="tab in HEADER_TABS"/.test(rail) &&
    /role="tab"/.test(rail) && /:aria-label="t\(tab\.label\)"/.test(rail) && /:title="t\(tab\.label\)"/.test(rail) &&
    /<AppIcon :name="tab\.icon"/.test(rail),
  'tablist dọc / icon / tên chưa đủ',
)
// U22 (đổi có chủ đích): 👤 / ⇥ tài khoản lên header (AccountMenu, kiểu Gmail) — đáy thanh chỉ còn ⚙.
check(
  'U20.3 ⚙ Cài đặt ở đáy thanh; header không còn tab, ⚙; tài khoản ở header (U22 — AccountMenu)',
  /shell__rail-bottom[\s\S]*name="settings"/.test(rail) && !/name="user"|name="log-out"/.test(rail) &&
    !/role="tab"/.test(header) && !/name="settings"/.test(header) && /<AccountMenu\b/.test(header) &&
    /<CalendarAgendaChip/.test(header),
  'chưa chuyển xuống đáy / header còn sót',
)
check(
  'U20.4 ☰ mở bảng mở rộng NỔI ĐÈ: icon + chữ, chọn mục / Esc / bấm ra ngoài thì đóng',
  /name="menu"/.test(rail) && /:aria-expanded="railOpen"/.test(rail) && drawer !== '' &&
    /\{\{\s*t\(tab\.label\)\s*\}\}/.test(drawer) && /selectTab\(tab\.id\)/.test(drawer) &&
    /function selectTab/.test(script) && /function onDrawerKeydown/.test(script) && /'Escape'/.test(script) &&
    /class="shell__drawer-scrim"[^>]*@click/.test(tpl.replace(/\n\s*/g, ' ')),
  'bảng mở rộng chưa đủ',
)
check(
  'U20.5 bàn phím tablist dọc: ↑ ↓ (+ ← →) / Home / End',
  /'ArrowDown'/.test(script) && /'ArrowUp'/.test(script) && /'Home'/.test(script) && /'End'/.test(script),
  'thiếu ↑ ↓',
)
check(
  'U20.6 icon mới trong bộ chung: menu / calendar / notes / bookmark',
  ['menu', 'calendar', 'notes', 'bookmark'].every((n) => new RegExp(`\\b${n}: \\[`).test(icons)),
  'thiếu icon',
)
check(
  'U20.7 i18n mở rộng / thu gọn menu (vi + en)',
  ['app.rail.expand', 'app.rail.collapse'].every((k) => vi.includes(`'${k}'`) && en.includes(`'${k}'`)),
  'thiếu i18n',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U20-navigation-rail.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U20 đúng spec.')
