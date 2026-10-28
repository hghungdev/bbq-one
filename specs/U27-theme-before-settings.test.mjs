/**
 * FAILING TEST — U27: ☀ giao diện về header, đứng trước ⚙ (☀ › ⚙ › tài khoản); đáy thanh dọc chỉ ☁.
 *
 * Chạy:   node specs/U27-theme-before-settings.test.mjs
 * GREEN sau khi áp specs/U27-theme-before-settings.spec.md.
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
const rail = (/<nav\b[^>]*class="shell__rail"[\s\S]*?<\/nav>/.exec(tpl) ?? [''])[0]
const railBottom = (/<div class="shell__rail-bottom">[\s\S]*?<\/div>/.exec(rail) ?? [''])[0]
const headerRight = (/<div class="shell__header-right">[\s\S]*?<\/header>/.exec(tpl) ?? [''])[0]
const at = (s) => headerRight.indexOf(s)

check(
  'U27.1 header phải: ☀ giao diện → ⚙ Cài đặt → tài khoản',
  at('<ThemeModeToggle') >= 0 && at('<ThemeModeToggle') < at('name="settings"') && at('name="settings"') < at('<AccountMenu'),
  `vị trí: theme ${at('<ThemeModeToggle')} gear ${at('name="settings"')} acc ${at('<AccountMenu')}`,
)
check(
  'U27.2 đáy thanh dọc chỉ ☁ (đồng bộ / chờ đồng bộ) — không ☀, không ⚙',
  railBottom !== '' && !/<ThemeModeToggle/.test(rail) && !/name="settings"/.test(rail) &&
    /<CloudSyncStatusBadge[\s\S]*?v-if="!isAnonymous"/.test(railBottom) &&
    /<SyncStatusBadge v-if="isAnonymous" @sign-in="onGoLogin"/.test(railBottom),
  railBottom.replace(/\s+/g, ' ').slice(0, 200) || 'mất khối đáy',
)
check(
  'U27.3 ☀ chỉ xuất hiện một lần trong App.vue (không trùng ở thanh dọc / bảng ☰)',
  (tpl.match(/<ThemeModeToggle\b/g) ?? []).length === 1,
  `số ☀: ${(tpl.match(/<ThemeModeToggle\b/g) ?? []).length}`,
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U27-theme-before-settings.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U27 đúng spec.')
