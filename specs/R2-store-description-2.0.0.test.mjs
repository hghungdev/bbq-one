/**
 * FAILING TEST — R2: mô tả Chrome Web Store khớp hành vi thật của 2.0.0.
 *
 * Chạy:   node specs/R2-store-description-2.0.0.test.mjs
 * GREEN sau khi áp specs/R2-store-description-2.0.0.spec.md.
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

const txt = read('docs', 'chrome-store-detailed-description.txt')
const md = read('docs', 'CHROME-STORE-LISTING.md')
const shortDesc = txt.split('\n')[0].trim()

check(
  'R2.1 bỏ chỗ sai: PIN Bookmark, "retro" / "vintage terminal", "your Supabase project", "today/tomorrow banner"',
  // Cấm mô tả PIN như tính năng còn có. R5 (đổi có chủ đích): mục What's new chỉ giữ bản mới nhất (2.0.1) nên câu
  // "Bookmark PIN removed" của 2.0.0 không còn bắt buộc.
  !/PIN encryption|PIN-protected|protected by a PIN/i.test(txt) &&
    !/retro|vintage terminal/i.test(txt + md) && !/your Supabase project/i.test(txt) &&
    !/tomorrow banner/i.test(txt),
  'còn mô tả cũ',
)
check(
  // R5 (đổi có chủ đích): mục What's new là bản 2.0.x mới nhất (2.0.1), không cứng 2.0.0.
  "R2.2 có WHAT'S NEW IN 2.0.x (không còn mục What's new 1.x ở đầu)",
  // B1 (đổi có chủ đích): bản mới nhất là 2.1.0.
  /WHAT'S NEW IN 2\.\d+\.\d+/.test(txt) && !/WHAT'S NEW IN 1\./.test(txt),
  'chưa cập nhật mục mới',
)
check(
  'R2.3 Google Calendar: tùy chọn, một chiều, Google tự làm mới, ai có link đọc được lịch',
  /GOOGLE CALENDAR/.test(txt) && /one-way/i.test(txt) && /Anyone with the link can (read|see) your calendar/i.test(txt) &&
    /Google (refreshes|decides)/i.test(txt),
  'thiếu Google Calendar',
)
check(
  // U30 (đổi có chủ đích): giới hạn 3 → 6 sự kiện / ngày.
  'R2.4 lịch: lặp tuần / tháng / năm, tối đa 6 sự kiện / ngày, tìm kiếm; đúng sự thật quyền riêng tư',
  // R5 (đổi có chủ đích): trước đây chỉ khớp nhờ dòng "(weekly, monthly, yearly)" của What's new 2.0.0 — nhận cả
  // câu ở mục CALENDAR "weekly, monthly, or yearly".
  /weekly, monthly,? (or |and )?yearly/i.test(txt) && /6 events per day/.test(txt) &&
    /No content scripts/i.test(txt) && /no analytics/i.test(txt) && /secure folders?/i.test(txt) &&
    /privacy-policy\.html/.test(txt),
  'thiếu tính năng / quyền riêng tư',
)
check(
  'R2.5 giới hạn Store: mô tả ngắn ≤ 132 ký tự (có calendar), toàn văn ≤ 16 000',
  shortDesc.length <= 132 && /calendar/i.test(shortDesc) && txt.length <= 16000 &&
    md.includes(shortDesc),
  `ngắn ${shortDesc.length} ký tự; toàn văn ${txt.length}; md có mô tả ngắn: ${md.includes(shortDesc)}`,
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R2-store-description-2.0.0.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R2 đúng spec.')
