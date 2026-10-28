/**
 * FAILING TEST — U10: bỏ nút "Ẩn" ở mục Ngày mai của bảng "Lịch sắp tới".
 *
 * Chạy:   node specs/U10-agenda-remove-hide.test.mjs
 * GREEN sau khi áp specs/U10-agenda-remove-hide.spec.md.
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

console.log('U10 — bỏ "Ẩn" ở mục Ngày mai')
const chip = read('src', 'components', 'calendar', 'CalendarAgendaChip.vue')
check(
  'U10.1 không còn nút / hàm ẩn nhắc ngày mai',
  !chip.includes('dismissTomorrow') && !chip.includes('dismissUpcomingBannerForDate'),
  'còn nút "Ẩn"',
)
check(
  'U10.2 không đọc trạng thái "đã ẩn" cũ (ai từng bấm Ẩn vẫn thấy Ngày mai)',
  !chip.includes('getDismissedUpcomingBannerDateKey') && /buildAgenda\([\s\S]{0,200}null,?\s*\)/.test(chip),
  'còn đọc trạng thái ẩn',
)
check('U10.3 vẫn mở lịch đúng ngày', /emit\('open-calendar',\s*dateKey\)/.test(chip), 'mất "Mở lịch"')
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
check(
  'U10.4 gỡ i18n của nút "Ẩn"',
  !/calendar\.agenda\.dismissTomorrow/.test(vi) && !/calendar\.agenda\.dismissTomorrow/.test(en),
  'khóa i18n mồ côi',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U10 đúng spec.')
