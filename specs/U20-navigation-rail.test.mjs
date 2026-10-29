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
// U28 (đổi có chủ đích): tooltip riêng (shell__rail-tip) thay `title` gốc của trình duyệt.
check(
  'U20.2 3 mục = tablist DỌC, chỉ icon (aria-label + tooltip theo tên mục)',
  /role="tablist"/.test(rail) && /aria-orientation="vertical"/.test(rail) && /v-for="tab in HEADER_TABS"/.test(rail) &&
    /role="tab"/.test(rail) && /:aria-label="t\(tab\.label\)"/.test(rail) &&
    /<span class="shell__rail-tip" aria-hidden="true">\{\{ t\(tab\.label\) \}\}<\/span>/.test(rail) &&
    /<AppIcon :name="tab\.icon"/.test(rail),
  'tablist dọc / icon / tên chưa đủ',
)
// U22 (đổi có chủ đích): 👤 / ⇥ tài khoản lên header (AccountMenu, kiểu Gmail) — đáy thanh chỉ còn ⚙.
// U24 (đổi có chủ đích): ⚙ cũng lên header (kiểu Gmail — thanh dọc chỉ để các mục).
check(
  'U20.3 thanh dọc không còn ⚙ / tài khoản; header không còn tab, có ⚙ + AccountMenu (U22, U24)',
  !/name="settings"|name="user"|name="log-out"/.test(rail) &&
    !/role="tab"/.test(header) && /name="settings"/.test(header) && /<AccountMenu\b/.test(header) &&
    /<CalendarAgendaChip/.test(header),
  'chưa chuyển xuống đáy / header còn sót',
)
// U28 (đổi có chủ đích): Sir — "không cần bấm vào phóng to ra", mặc định chỉ icon + tooltip → bỏ ☰ và bảng.
check(
  'U20.4 không còn ☰ / bảng mở rộng (U28 — chỉ icon + tooltip)',
  !/name="menu"/.test(rail) && drawer === '' && !/railOpen|function selectTab|function onDrawerKeydown/.test(script),
  'còn ☰ / bảng mở rộng',
)
check(
  'U20.5 bàn phím tablist dọc: ↑ ↓ (+ ← →) / Home / End',
  /'ArrowDown'/.test(script) && /'ArrowUp'/.test(script) && /'Home'/.test(script) && /'End'/.test(script),
  'thiếu ↑ ↓',
)
// U28 (đổi có chủ đích): icon menu (☰) gỡ cùng bảng mở rộng.
check(
  'U20.6 icon mới trong bộ chung: calendar / notes / bookmark (menu đã gỡ — U28)',
  ['calendar', 'notes', 'bookmark'].every((n) => new RegExp(`\\b${n}: \\[`).test(icons)) && !/\bmenu: \[/.test(icons),
  'thiếu icon',
)
// U28 (đổi có chủ đích): bỏ ☰ → bỏ luôn chuỗi mở rộng / thu gọn.
check(
  'U20.7 i18n mở rộng / thu gọn menu đã gỡ (vi + en) — U28',
  ['app.rail.expand', 'app.rail.collapse'].every((k) => !vi.includes(`'${k}'`) && !en.includes(`'${k}'`)),
  'còn i18n chết',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U20-navigation-rail.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U20 đúng spec.')
