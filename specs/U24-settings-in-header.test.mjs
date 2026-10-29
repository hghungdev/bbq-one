/**
 * FAILING TEST — U24: ⚙ Cài đặt lên header (kiểu Gmail, ngay trước avatar); thanh dọc chỉ còn các mục.
 *
 * Chạy:   node specs/U24-settings-in-header.test.mjs
 * GREEN sau khi áp specs/U24-settings-in-header.spec.md.
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
const rail = (/<nav\b[^>]*class="shell__rail"[\s\S]*?<\/nav>/.exec(tpl) ?? [''])[0]
const drawer = (/<div\b[^>]*class="shell__drawer"[\s\S]*?<!-- \/drawer -->/.exec(tpl) ?? [''])[0]
const headerRight = (/<div class="shell__header-right">[\s\S]*?<\/header>/.exec(tpl) ?? [''])[0]

// U26 (đổi có chủ đích): khối đáy thanh dọc quay lại — chứa ☀ ☁ (vẫn không ⚙).
check(
  'U24.1 thanh dọc: không ⚙ (khối đáy chỉ ☀ ☁ — U26)',
  rail !== '' && !/name="settings"|showSettings/.test(rail),
  'thanh dọc còn ⚙',
)
// U28 (đổi có chủ đích): bảng ☰ đã gỡ hẳn — càng không có Cài đặt trong đó.
check(
  'U24.2 bảng mở rộng ☰: đã gỡ (U28) — không Cài đặt, không khối đáy',
  drawer === '' && !/shell__drawer-bottom/.test(tpl),
  'bảng mở rộng còn Cài đặt',
)
const gear = (/<IconButton\b[^>]*>\s*<AppIcon name="settings"[^>]*\/>\s*<\/IconButton>/.exec(headerRight) ?? [''])[0]
const flatGear = gear.replace(/\s+/g, ' ')
check(
  'U24.3 header: ⚙ = IconButton (như ☀), nhãn "Cài đặt", icon 17 px, bấm mở Settings',
  /:label="t\('app\.aria\.settings'\)"/.test(flatGear) && /@click="showSettings = true"/.test(flatGear) &&
    /<AppIcon name="settings" :size="17"/.test(flatGear) &&
    /import IconButton from '@\/components\/ui\/IconButton\.vue'/.test(app),
  flatGear.slice(0, 200) || 'header chưa có ⚙',
)
const at = (s) => headerRight.indexOf(s)
// U26 (đổi có chủ đích): ☀ ☁ xuống đáy thanh dọc — header chỉ ⚙ → tài khoản.
// U27 (đổi có chủ đích): ☀ về lại header, đứng trước ⚙ — ☁ vẫn ở đáy thanh.
check(
  'U24.4 thứ tự Gmail: ☀ → ⚙ → tài khoản (☁ ở đáy thanh dọc — U26, U27)',
  at('name="settings"') >= 0 && at('name="settings"') < at('<AccountMenu') &&
    at('<ThemeModeToggle') >= 0 && at('<ThemeModeToggle') < at('name="settings"') &&
    at('<CloudSyncStatusBadge') === -1,
  `vị trí: theme ${at('<ThemeModeToggle')} cloud ${at('<CloudSyncStatusBadge')} gear ${at('name="settings"')} acc ${at('<AccountMenu')}`,
)
// U26 (đổi có chủ đích): .shell__rail-bottom dùng lại cho ☀ ☁; bảng ☰ vẫn không khối đáy.
check(
  'U24.5 bỏ CSS chết .shell__drawer-bottom (.shell__rail-bottom dùng lại — U26)',
  !/\.shell__drawer-bottom/.test(css),
  'còn CSS khối đáy',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U24-settings-in-header.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U24 đúng spec.')
