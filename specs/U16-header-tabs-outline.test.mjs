/**
 * FAILING TEST — U16: tab header kiểu viền (outline), không còn nút đặc kiểu Bootstrap.
 *
 * Chạy:   node specs/U16-header-tabs-outline.test.mjs
 * GREEN sau khi áp specs/U16-header-tabs-outline.spec.md.
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
const style = app.slice(app.indexOf('<style'))
// U20 (đổi có chủ đích): tab chuyển từ header sang thanh dọc — kiểm tablist trên thanh dọc (shell__rail-items).
const nav = (/<(?:nav|div)\b[^>]*class="shell__(?:tabs|rail-items)"[\s\S]*?<\/(?:nav|div)>/.exec(tpl) ?? [''])[0]
const rule = (sel) => {
  const i = style.indexOf(`${sel} {`)
  return i === -1 ? '' : style.slice(i, style.indexOf('}', i))
}

console.log('U16 — tab header')
check(
  'U16.1 tab là <button role="tab"> riêng (không còn RetroButton ghi đè :deep / !important)',
  nav !== '' && !nav.includes('<RetroButton') &&
    ((nav.match(/role="tab"/g) ?? []).length === 3 ||
      (/v-for="tab in HEADER_TABS"/.test(nav) && /role="tab"/.test(nav) &&
        (/const HEADER_TABS = \[([\s\S]*?)\] as const/.exec(app)?.[1].match(/id: '/g) ?? []).length === 3)) &&
    !/\.shell__tabs :deep\(\.retro-btn/.test(style) && !/shell__tab[\w-]*[^{]*\{[^}]*!important/.test(style),
  'còn RetroButton / !important',
)
// U20 (đổi có chủ đích): mục chọn trên thanh dọc = viên nền nhấn NHẠT + icon màu nhấn (không còn viền) —
// điều cốt lõi của U16 vẫn giữ: không tô đặc màu nhấn kiểu Bootstrap.
const active = rule('.shell__rail-item--active,\n  .shell__rail-item--active:hover') || rule('.shell__tab--active')
check(
  'U16.2 mục đang chọn = chữ / icon màu nhấn, KHÔNG tô đặc màu nhấn (U20: nền nhấn nhạt trên thanh dọc)',
  active !== '' && /color:\s*var\(--accent\)/.test(active) &&
    !/background:\s*var\(--accent\)/.test(active) && !/var\(--on-accent\)/.test(active),
  active.replace(/\s+/g, ' ') || 'chưa có .shell__rail-item--active',
)
check(
  'U16.3 bàn phím tablist: ← → / Home / End + roving tabindex',
  /onTabsKeydown/.test(nav) && /ArrowRight/.test(app) && /ArrowLeft/.test(app) && /:tabindex="activeTab === /.test(nav),
  'chưa có điều hướng bàn phím',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U16-header-tabs-outline.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U16 đúng spec.')
