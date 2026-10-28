/**
 * FAILING TEST — U23: logo mới (bản transparent) — header kiểu Gmail (logo + tên) + icon Chrome.
 *
 * Chạy:   node specs/U23-brand-logo.test.mjs
 * GREEN sau khi áp specs/U23-brand-logo.spec.md.
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
const bytes = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p))
  } catch {
    return null
  }
}
const same = (a, b) => {
  const x = bytes(...a)
  const y = bytes(...b)
  return !!x && !!y && x.equals(y)
}
const read = (...p) => (bytes(...p) ?? '').toString('utf8')

const sizes = [16, 32, 48, 128]
const diff = sizes.filter((n) => !same(['public', `icon-${n}.png`], ['design', 'transparent', `icon${n}.png`]))
check(
  'U23.1 icon Chrome (public/icon-16/32/48/128.png) = bản transparent',
  diff.length === 0,
  `khác: ${diff.join(', ')}`,
)
const manifest = JSON.parse(read('public', 'manifest.json'))
check(
  'U23.2 manifest giữ nguyên tên file icon (icons + action.default_icon)',
  sizes.every((n) => manifest.icons?.[n] === `icon-${n}.png` && manifest.action?.default_icon?.[n] === `icon-${n}.png`),
  'manifest đổi',
)
check(
  'U23.3 logo app src/assets/brand/bbqone-logo.png = design/transparent/icon64.png',
  same(['src', 'assets', 'brand', 'bbqone-logo.png'], ['design', 'transparent', 'icon64.png']),
  'chưa có logo',
)

const app = read('src', 'pages', 'App.vue')
const tpl = app.slice(app.indexOf('<template>'), app.lastIndexOf('</template>')).replace(/\n\s*/g, ' ')
const brand = /<span class="shell__brand"> <img class="shell__brand-logo" :src="brandLogo" alt="" width="28" height="28" \/> <span class="shell__brand-name">BBQOne<\/span> <\/span>/g
const headerLeft = (/<div class="shell__header-left">[\s\S]*?<\/div>/.exec(tpl) ?? [''])[0]
const drawerHead = (/<div class="shell__drawer-head">[\s\S]*?<\/span> <\/span> <\/div>/.exec(tpl) ?? [''])[0]
check(
  'U23.4 header + đầu bảng ☰: cụm logo (alt="" — trang trí) + tên "BBQOne"',
  (tpl.match(brand) ?? []).length === 2 &&
    /shell__brand-logo/.test(headerLeft) && /shell__brand-logo/.test(drawerHead) &&
    /import brandLogo from '@\/assets\/brand\/bbqone-logo\.png'/.test(app),
  `số cụm logo: ${(tpl.match(brand) ?? []).length}`,
)
const css = app.slice(app.indexOf('<style'))
const rule = (sel) => (new RegExp(`\\${sel} \\{[^}]*\\}`).exec(css) ?? [''])[0]
check(
  'U23.5 CSS: logo 28 × 28 không co; tên màu chữ thường (không còn --accent)',
  /width: 28px/.test(rule('.shell__brand-logo')) && /height: 28px/.test(rule('.shell__brand-logo')) &&
    /flex: 0 0 auto/.test(rule('.shell__brand-logo')) &&
    /color: var\(--text-primary\)/.test(rule('.shell__brand-name')) &&
    !/--accent/.test(rule('.shell__brand') + rule('.shell__brand-name')),
  `${rule('.shell__brand-logo')} | ${rule('.shell__brand-name')}`,
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U23-brand-logo.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U23 đúng spec.')
