/**
 * FAILING TEST — U26: ☀ ☁ xuống đáy thanh dọc; logo header nét (srcset) + viền khi sáng; icon Chrome vuông hơn.
 *
 * Chạy:   node specs/U26-rail-tools-logo-polish.test.mjs
 * (Độ lấp khung của icon Chrome đo bằng giải mã PNG trong specs/U25-brand-icon-size.test.mjs.)
 * GREEN sau khi áp specs/U26-rail-tools-logo-polish.spec.md.
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
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}
const flat = (s) => s.replace(/\s+/g, ' ')

const app = read('src', 'pages', 'App.vue')
const tpl = app.slice(app.indexOf('<template>'), app.lastIndexOf('</template>'))
const css = app.slice(app.indexOf('<style'))
const rail = (/<nav\b[^>]*class="shell__rail"[\s\S]*?<\/nav>/.exec(tpl) ?? [''])[0]
const railBottom = (/<div class="shell__rail-bottom">[\s\S]*?<\/div>/.exec(rail) ?? [''])[0]
const headerRight = (/<div class="shell__header-right">[\s\S]*?<\/header>/.exec(tpl) ?? [''])[0]
const drawer = (/<div\b[^>]*class="shell__drawer"[\s\S]*?<!-- \/drawer -->/.exec(tpl) ?? [''])[0]

console.log('1 — ☀ ☁ xuống đáy thanh dọc')
// U27 (đổi có chủ đích): ☀ về lại header (trước ⚙) — đáy thanh chỉ còn ☁.
check(
  'U26.1 đáy thanh dọc: ☁ đồng bộ (đăng nhập) / ☁ chờ đồng bộ (chưa đăng nhập); không ⚙ (☀ ở header — U27)',
  railBottom !== '' &&
    !/<ThemeModeToggle/.test(railBottom) &&
    /<CloudSyncStatusBadge[\s\S]*?v-if="!isAnonymous"/.test(railBottom) &&
    /<SyncStatusBadge v-if="isAnonymous" @sign-in="onGoLogin"/.test(railBottom) &&
    !/name="settings"/.test(rail),
  flat(railBottom).slice(0, 200) || 'chưa có khối đáy',
)
// U27 (đổi có chủ đích): header ☀ → ⚙ → tài khoản; ☁ vẫn ở đáy thanh.
check(
  'U26.2 header phải: không ☁; ⚙ → tài khoản (☀ đứng trước ⚙ — U27)',
  !/<CloudSyncStatusBadge|<SyncStatusBadge/.test(headerRight) &&
    headerRight.indexOf('name="settings"') >= 0 && headerRight.indexOf('name="settings"') < headerRight.indexOf('<AccountMenu'),
  'header còn ☀ / ☁',
)
check('U26.3 bảng ☰ vẫn chỉ điều hướng (không ☀ ☁ ⚙)', drawer !== '' && !/ThemeModeToggle|SyncStatusBadge|name="settings"/.test(drawer), 'bảng ☰ lẫn công cụ')
check(
  'U26.4 CSS: khối đáy đẩy xuống cuối; nút ☀ ☁ cỡ mục thanh dọc (40 × 36, icon 20 px) qua :deep',
  /\.shell__rail-bottom \{[^}]*margin-top: auto/.test(css) &&
    /\.shell__rail-bottom :deep\(button\) \{[^}]*width: 40px;[^}]*height: 36px/.test(css) &&
    /\.shell__rail-bottom :deep\(svg\) \{[^}]*width: 20px;[^}]*height: 20px/.test(css),
  'thiếu CSS khối đáy',
)

console.log('\n2 — logo header')
const img = flat((/<img class="shell__brand-logo"[^>]*\/>/.exec(tpl) ?? [''])[0])
check(
  'U26.5 logo: srcset 1x = 32 px, 2x = 64 px (không để trình duyệt tự thu 64 → 32 ở màn 1x)',
  /:srcset="brandLogoSrcset"/.test(img) &&
    /import brandLogo32 from '@\/assets\/brand\/bbqone-logo-32\.png'/.test(app) &&
    /const brandLogoSrcset = `\$\{brandLogo32\} 1x, \$\{brandLogo\} 2x`/.test(app) &&
    fs.existsSync(path.join(ROOT, 'src', 'assets', 'brand', 'bbqone-logo-32.png')),
  img || 'chưa có srcset',
)
const g = read('src', 'assets', 'styles', 'global.css')
const lightRoot = (/^:root \{[\s\S]*?^\}/m.exec(g) ?? [''])[0]
const darkRoot = (/^html\[data-theme='dark'\] \{[\s\S]*?^\}/m.exec(g) ?? [''])[0]
check(
  'U26.6 viền tóc khi sáng: --brand-logo-edge (sáng = xám mờ, tối = trong suốt) + drop-shadow trên logo',
  /--brand-logo-edge: rgba\(/.test(lightRoot) && /--brand-logo-edge: transparent/.test(darkRoot) &&
    /\.shell__brand-logo \{[^}]*filter: drop-shadow\(0 0 0\.6px var\(--brand-logo-edge\)\)/.test(css),
  'chưa có viền',
)

console.log('\n3 — icon Chrome')
const script = read('scripts', 'make-brand-icons.py')
check(
  'U26.7 script: icon Chrome cắt bớt 50 % phần ngang dư (CHROME_TRIM = 0.5); logo header không cắt → logo{32,64}.png',
  /CHROME_TRIM = 0\.5/.test(script) && /logo\{size\}\.png|f"logo\{size\}\.png"/.test(script) &&
    /bbqone-logo-32\.png/.test(script) && !fs.existsSync(path.join(ROOT, 'design', 'transparent-tight', 'icon64.png')),
  'script chưa tách Chrome / logo',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U26-rail-tools-logo-polish.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U26 đúng spec.')
