/**
 * FAILING TEST — U28: thanh dọc chỉ icon + tooltip (bỏ ☰ và bảng mở rộng).
 *
 * Chạy:   node specs/U28-rail-icons-tooltip.test.mjs
 * GREEN sau khi áp specs/U28-rail-icons-tooltip.spec.md.
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
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const app = read('src', 'pages', 'App.vue')
const script = app.slice(0, app.indexOf('<template>'))
const tpl = app.slice(app.indexOf('<template>'), app.lastIndexOf('</template>'))
const css = app.slice(app.indexOf('<style'))
const rail = (/<nav\b[^>]*class="shell__rail"[\s\S]*?<\/nav>/.exec(tpl) ?? [''])[0]
const tabBtn = (/<button\s+v-for="tab in HEADER_TABS"[\s\S]*?<\/button>/.exec(rail) ?? [''])[0]

console.log('U28 — thanh dọc chỉ icon + tooltip')
check(
  'U28.1 không còn ☰ / bảng mở rộng (template, script, CSS)',
  rail !== '' && !/name="menu"/.test(tpl) && !/shell__drawer|shell-drawer/.test(tpl + css) &&
    !/railOpen|railMenuRef|drawerRef|openRail|closeRail|selectTab|onDrawerKeydown/.test(script + tpl),
  'còn ☰ / bảng mở rộng',
)
check(
  'U28.2 mỗi mục: tooltip <span class="shell__rail-tip" aria-hidden="true">{{ t(tab.label) }}</span>; giữ aria-label, bỏ :title',
  /<span class="shell__rail-tip" aria-hidden="true">\{\{ t\(tab\.label\) \}\}<\/span>/.test(tabBtn) &&
    /:aria-label="t\(tab\.label\)"/.test(tabBtn) && !/:title=/.test(tabBtn) && /<AppIcon :name="tab\.icon"/.test(tabBtn),
  tabBtn.replace(/\s+/g, ' ').slice(0, 200) || 'không thấy nút mục',
)
const rule = (sel) => (new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css) ?? ['', ''])[1]
const tip = rule('.shell__rail-tip')
const show = rule('.shell__rail-item:hover .shell__rail-tip,\n  .shell__rail-item:focus-visible .shell__rail-tip')
check(
  'U28.3 CSS tooltip: bên phải icon, đảo màu, ẩn mặc định (opacity 0, không bắt chuột); hiện khi :hover / :focus-visible (trễ)',
  /position:\s*absolute/.test(tip) && /left:\s*calc\(100% \+/.test(tip) && /opacity:\s*0/.test(tip) &&
    /pointer-events:\s*none/.test(tip) && /background:\s*var\(--text-primary\)/.test(tip) && /color:\s*var\(--bg-primary\)/.test(tip) &&
    /white-space:\s*nowrap/.test(tip) && /opacity:\s*1/.test(show) && /transition-delay/.test(show) &&
    /position:\s*relative/.test(rule('.shell__rail-item')) && /z-index/.test(rule('.shell__rail')),
  `tip={${tip.replace(/\s+/g, ' ')}} show={${show.replace(/\s+/g, ' ')}}`,
)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const icons = read('src', 'components', 'ui', 'icons.ts')
check(
  'U28.4 dọn: bỏ i18n app.rail.expand / collapse (vi + en) và icon menu không còn dùng',
  !/'app\.rail\.(expand|collapse)'/.test(vi + en) && !/\bmenu: \[/.test(icons),
  'còn i18n / icon chết',
)
check(
  'U28.5 giữ: tablist dọc + ↑ ↓ / Home / End; ☁ ở đáy thanh',
  /role="tablist"/.test(rail) && /aria-orientation="vertical"/.test(rail) && /@keydown="onTabsKeydown"/.test(rail) &&
    /'ArrowDown'/.test(script) && /'Home'/.test(script) && /class="shell__rail-bottom"/.test(rail),
  'mất tablist / phím / khối đáy',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U28-rail-icons-tooltip.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U28 đúng spec.')
