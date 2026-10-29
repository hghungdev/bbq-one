/**
 * FAILING TEST — R1: phát hành 2.0.0 — phiên bản ở mọi nơi + tài liệu phát hành khớp hành vi thật.
 *
 * Chạy:   node specs/R1-release-2.0.0.test.mjs
 * GREEN sau khi áp specs/R1-release-2.0.0.spec.md.
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
const manifest = JSON.parse(read('public', 'manifest.json'))
// R5 (đổi có chủ đích): 2.0.1 đã phát hành — các chỗ ghi "phiên bản hiện tại" kiểm theo manifest (≥ 2.0.0) thay vì
// cứng 2.0.0; phần lịch sử 2.0.0 (mục README, "Release 2.0.0 (highlights)") vẫn kiểm như cũ.
const V = manifest.version
const atLeast200 = /^2\.0\.\d+$|^2\.[1-9]\d*\.\d+$|^[3-9]\.\d+\.\d+$/.test(V)
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
check(
  'R1.1 manifest / package.json / package-lock.json cùng phiên bản, ≥ 2.0.0 (R5)',
  atLeast200 && manifest.version === V && pkg.version === V && lock.version === V && lock.packages?.['']?.version === V,
  `manifest=${manifest.version} pkg=${pkg.version} lock=${lock.version}/${lock.packages?.['']?.version}`,
)
const readme = read('README.md')
check(
  'R1.2 README: Version = phiên bản hiện tại (R5) + "What changed in 2.0.0"; không còn mô tả Bookmark PIN',
  readme.includes(`**Version:** ${V}`) && /## What changed in 2\.0\.0/.test(readme) &&
    !/PIN-protected|signed in with PIN/.test(readme),
  'README chưa cập nhật',
)
check('R1.3 DESIGN.md token: version = phiên bản hiện tại (R5)', read('DESIGN.md').includes(`\nversion: ${V}\n`), 'DESIGN.md')
const pp = read('docs', 'privacy-policy.html')
check(
  'R1.4 privacy policy: áp dụng từ 2.0.x (R5: 2.0.1 — bỏ Google Fonts); bỏ Bookmark PIN; có mục Google Calendar (link bí mật, một chiều, Google tải)',
  // B1 (đổi có chủ đích): 2.1.0 thêm đoạn "Backup files" → policy áp dụng từ 2.1.0.
  /applies to extension version 2\.\d+\.\d+ and later/.test(pp) &&
    !/protected by a PIN|PIN-protected/.test(pp) &&
    /Optional Google Calendar link/.test(pp) &&
    /Anyone who has the link can read your calendar/.test(pp) &&
    /one-way/i.test(pp) &&
    /<strong>Google Calendar<\/strong>/.test(pp),
  'privacy policy chưa cập nhật',
)
check(
  'R1.5 Store listing: "Release 2.0.0 (highlights)"; permissions doc ghi phiên bản hiện tại (R5)',
  /Release 2\.0\.0 \(highlights\)/.test(read('docs', 'CHROME-STORE-LISTING.md')) &&
    read('docs', 'CHROME-STORE-PERMISSIONS.md').includes(`**v${V}**`),
  'store docs chưa cập nhật',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R1-release-2.0.0.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R1 đúng spec.')
