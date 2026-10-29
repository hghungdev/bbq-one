/**
 * FAILING TEST — U29: Esc không đóng extension; chỉ đóng lớp trong cùng.
 *
 * Chạy:   node specs/U29-esc-keeps-popup.test.mjs
 * GREEN sau khi áp specs/U29-esc-keeps-popup.spec.md.
 * (Hành vi popup thật đã đo trên Chromium qua DevTools Protocol — xem spec; ở đây kiểm nối dây.)
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

console.log('U29 — Esc không đóng extension')
const main = read('src', 'main.ts')
check(
  "U29.1 main.ts: window keydown pha capture — Escape (không IME) → preventDefault, KHÔNG stopPropagation",
  /window\.addEventListener\(\s*'keydown',[\s\S]*?e\.key === 'Escape' && !e\.isComposing\)\s*e\.preventDefault\(\)[\s\S]*?\{ capture: true \}\s*,?\s*\)/.test(main) &&
    !/stopPropagation/.test(main),
  'chưa có / sai listener chặn Esc ở mức trang',
)

const fourth = [
  ['src/components/ui/ListItemSettingsMenu.vue', /'Escape'[\s\S]*?close\(\)[\s\S]*?triggerRef\.value\?\.focus\(\)/, 'menu ⚙: Esc → close() + focus nút ⚙'],
  ['src/components/sync/SyncConflictDialog.vue', /'Escape'[\s\S]*?emit\('resolve', 'cancel'\)/, "SyncConflictDialog: Esc → resolve('cancel')"],
  ['src/components/sync/ConflictBackupsDialog.vue', /'Escape'[\s\S]*?emit\('close'\)/, 'ConflictBackupsDialog: Esc → close'],
  ['src/components/sync/CalendarOverflowResolverDialog.vue', /'Escape'[\s\S]*?emit\('cancel'\)/, 'CalendarOverflowResolverDialog: Esc → cancel'],
]
for (const [file, re, label] of fourth) {
  const src = read(...file.split('/'))
  const script = src.slice(0, src.indexOf('<template>'))
  check(`U29.2 ${label}; gỡ listener khi đóng / unmount`, re.test(script) && /removeEventListener\('keydown'/.test(script), file)
}

// Chốt chặn: mọi lớp phủ phải xử lý Esc.
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]))
}
const overlays = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.vue')).filter((f) => /role="(dialog|alertdialog|menu)"|aria-modal|bbqone-overlay/.test(fs.readFileSync(f, 'utf8')))
const noEsc = overlays.filter((f) => !/'Escape'/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f))
check(`U29.3 mọi lớp phủ (${overlays.length} component) xử lý Esc`, noEsc.length === 0, noEsc.join(', '))

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U29-esc-keeps-popup.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U29 đúng spec.')
