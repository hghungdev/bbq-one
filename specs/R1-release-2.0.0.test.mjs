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
const V = '2.0.0'

const manifest = JSON.parse(read('public', 'manifest.json'))
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
check(
  'R1.1 manifest / package.json / package-lock.json = 2.0.0',
  manifest.version === V && pkg.version === V && lock.version === V && lock.packages?.['']?.version === V,
  `manifest=${manifest.version} pkg=${pkg.version} lock=${lock.version}/${lock.packages?.['']?.version}`,
)
const readme = read('README.md')
check(
  'R1.2 README: Version 2.0.0 + "What changed in 2.0.0"; không còn mô tả Bookmark PIN',
  readme.includes(`**Version:** ${V}`) && /## What changed in 2\.0\.0/.test(readme) &&
    !/PIN-protected|signed in with PIN/.test(readme),
  'README chưa cập nhật',
)
check('R1.3 DESIGN.md token: version 2.0.0', /\nversion: 2\.0\.0\n/.test(read('DESIGN.md')), 'DESIGN.md')
const pp = read('docs', 'privacy-policy.html')
check(
  'R1.4 privacy policy: 2.0.0; bỏ Bookmark PIN; có mục Google Calendar (link bí mật, một chiều, Google tải)',
  /applies to extension version 2\.0\.0 and later/.test(pp) &&
    !/protected by a PIN|PIN-protected/.test(pp) &&
    /Optional Google Calendar link/.test(pp) &&
    /Anyone who has the link can read your calendar/.test(pp) &&
    /one-way/i.test(pp) &&
    /<strong>Google Calendar<\/strong>/.test(pp),
  'privacy policy chưa cập nhật',
)
check(
  'R1.5 Store listing: "Release 2.0.0 (highlights)"; permissions doc ghi v2.0.0',
  /Release 2\.0\.0 \(highlights\)/.test(read('docs', 'CHROME-STORE-LISTING.md')) &&
    /v2\.0\.0/.test(read('docs', 'CHROME-STORE-PERMISSIONS.md')),
  'store docs chưa cập nhật',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R1-release-2.0.0.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R1 đúng spec.')
