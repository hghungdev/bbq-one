/**
 * FAILING TEST — R5: phát hành 2.0.1 — phiên bản ở mọi nơi + tài liệu phát hành khớp hành vi thật.
 *
 * Chạy:   node specs/R5-release-2.0.1.test.mjs
 * GREEN sau khi áp specs/R5-release-2.0.1.spec.md.
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
// B1 (đổi có chủ đích): 2.1.0 đã nâng — chỗ ghi "phiên bản hiện tại" kiểm theo manifest (≥ 2.0.1); phần lịch sử 2.0.1
// (mục README, "Release 2.0.1 (highlights)", đoạn Address bar search) vẫn kiểm như cũ.
const V = manifest.version
const atLeast201 = /^2\.0\.([1-9]\d*)$|^2\.[1-9]\d*\.\d+$|^[3-9]\.\d+\.\d+$/.test(V)
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
check(
  'R5.1 manifest / package.json / package-lock.json cùng phiên bản, ≥ 2.0.1 (B1)',
  atLeast201 && manifest.version === V && pkg.version === V && lock.version === V && lock.packages?.['']?.version === V,
  `manifest=${manifest.version} pkg=${pkg.version} lock=${lock.version}/${lock.packages?.['']?.version}`,
)
check(
  'R5.2 quyền giữ như 2.0.0 + khóa omnibox (không cảnh báo mới → cập nhật không bị tạm tắt)',
  JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'clipboardWrite', 'offscreen', 'bookmarks', 'downloads']) &&
    JSON.stringify(manifest.host_permissions) === JSON.stringify(['https://*.supabase.co/*']) && manifest.omnibox?.keyword === 'bbq',
  JSON.stringify({ p: manifest.permissions, h: manifest.host_permissions }),
)

const readme = read('README.md')
const w201 = readme.indexOf('## What changed in 2.0.1')
const w200 = readme.indexOf('## What changed in 2.0.0')
const sec = w201 === -1 ? '' : readme.slice(w201, w200)
check(
  'R5.3 README: Version = phiên bản hiện tại (B1); "What changed in 2.0.1" trong mục lục, đứng trước 2.0.0',
  readme.includes(`**Version:** ${V}`) && /\[What changed in 2\.0\.1\]\(#what-changed-in-201\)/.test(readme) && w201 !== -1 && w201 < w200,
  'README chưa cập nhật',
)
check(
  'R5.4 README 2.0.1 nói đủ: nhanh hơn, font đóng gói, thanh địa chỉ bbq, 6 sự kiện / ngày, chuỗi lặp, Esc / bấm ngoài, lỗi xóa khi không đăng nhập',
  /faster/i.test(sec) && /font/i.test(sec) && /`bbq`/.test(sec) && /6 events/.test(sec) && /series|repeating/i.test(sec) &&
    /Esc/.test(sec) && /outside/i.test(sec) && /without signing in|not signed in/i.test(sec),
  sec.slice(0, 300),
)
const design = read('DESIGN.md')
check(
  'R5.5 DESIGN.md: token version = phiên bản hiện tại (B1); sơ đồ khung mới (header hết bề ngang + thanh dọc)',
  design.includes(`\nversion: ${V}\n`) && !/\[Calendar\] \[Notes\] \[Bookmark\]/.test(design) && /rail/i.test(design.slice(design.indexOf('### Dashboard shell'), design.indexOf('### Dashboard shell') + 1200)),
  'DESIGN.md',
)
const pp = read('docs', 'privacy-policy.html')
check(
  'R5.6 privacy policy: áp dụng từ 2.x (B1: 2.1.0); có đoạn Address bar search (bbq, chỉ trên máy, không gửi đi)',
  /applies to extension version 2\.\d+\.\d+ and later/.test(pp) && /Address bar search/.test(pp) && /<code>bbq<\/code>/.test(pp) &&
    /not sent/i.test(pp),
  'privacy policy chưa cập nhật',
)
const listing = read('docs', 'CHROME-STORE-LISTING.md')
const txt = read('docs', 'chrome-store-detailed-description.txt')
check(
  'R5.7 Store: "Release 2.0.1 (highlights)" trước 2.0.0; WHAT\'S NEW là bản mới nhất (B1: 2.1.0, không còn 2.0.0); mô tả có tìm từ thanh địa chỉ; permissions doc ghi phiên bản hiện tại + omnibox',
  /Release 2\.0\.1 \(highlights\)/.test(listing) && listing.indexOf('Release 2.0.1') < listing.indexOf('Release 2.0.0') &&
    txt.includes(`WHAT'S NEW IN ${V}`) && !/WHAT'S NEW IN 2\.0\.0/.test(txt) && /type "bbq", press Space/.test(txt) &&
    read('docs', 'CHROME-STORE-PERMISSIONS.md').includes(`**v${V}**`) && /omnibox/.test(read('docs', 'CHROME-STORE-PERMISSIONS.md')),
  'store docs chưa cập nhật',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R5-release-2.0.1.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R5 đúng spec.')
