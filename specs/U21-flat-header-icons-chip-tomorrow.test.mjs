/**
 * FAILING TEST — U21: nhóm ☀ ☁ trên header phẳng (không hộp bo góc); chip ghi đủ "Ngày mai 3".
 *
 * Chạy:   node specs/U21-flat-header-icons-chip-tomorrow.test.mjs
 * GREEN sau khi áp specs/U21-flat-header-icons-chip-tomorrow.spec.md.
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
/** Khối CSS đầu tiên có đúng selector `sel {`. */
const rule = (src, sel) => {
  const i = src.indexOf(`${sel} {`)
  return i === -1 ? '' : src.slice(i, src.indexOf('}', i))
}
const boxed = (r) => /border:\s*1px solid/.test(r) || /border-color:/.test(r) || /background:\s*(?!transparent)/.test(r)

const app = read('src', 'pages', 'App.vue')
const right = rule(app, '.shell__header-right')
check('U21.1 .shell__header-right: không viền, không nền (chỉ hàng icon)', right !== '' && !boxed(right), right.replace(/\s+/g, ' '))

const cloud = read('src', 'components', 'sync', 'CloudSyncStatusBadge.vue')
const states = ['--idle', '--done', '--syncing', '--unsaved', '--error'].map((s) => rule(cloud, `.cloud-sync-badge${s}`))
check(
  'U21.2 ☁ đồng bộ: nút phẳng; trạng thái chỉ bằng MÀU icon (không viền / nền theo trạng thái)',
  !boxed(rule(cloud, '.cloud-sync-badge')) && states.every((r) => r === '' || !boxed(r)) && /\.cloud-sync-badge--done[^{]*\{[^}]*color:/.test(cloud),
  [rule(cloud, '.cloud-sync-badge'), ...states].map((r) => r.replace(/\s+/g, ' ')).join(' | '),
)
const pending = read('src', 'components', 'sync', 'SyncStatusBadge.vue')
check(
  'U21.3 ☁ chờ đồng bộ (chưa đăng nhập): phẳng, giữ bong bóng số',
  !boxed(rule(pending, '.sync-pending-badge')) && /sync-pending-badge__bubble/.test(pending),
  rule(pending, '.sync-pending-badge').replace(/\s+/g, ' '),
)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
check(
  'U21.4 chip ghi đủ: "Ngày mai {n}" / "Tomorrow {n}"',
  vi.includes("'calendar.agenda.tomorrowCount': 'Ngày mai {n}'") && en.includes("'calendar.agenda.tomorrowCount': 'Tomorrow {n}'"),
  'còn viết tắt',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U21-flat-header-icons-chip-tomorrow.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U21 đúng spec.')
