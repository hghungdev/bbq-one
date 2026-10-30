/**
 * FAILING TEST — R6: phát hành 2.2.0 (thao tác an toàn: S11 xóa tất cả bookmark, S12 gợi ý thanh địa chỉ, S9 thư mục bảo
 * mật 600k + chốt salt, N6.1 bỏ lock Supabase). Quyền không đổi.
 *
 * Chạy:   node specs/R6-release-2.2.0.test.mjs
 * GREEN sau khi áp specs/R6-release-2.2.0.spec.md.
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
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}

console.log('R6 — phát hành 2.2.0')
// R7 (đổi có chủ đích, 2.3.0): chỗ ghi "phiên bản hiện tại" kiểm theo manifest (≥ 2.2.0); phần lịch sử 2.2.0 (README
// "What changed in 2.2.0", "Release 2.2.0 (highlights)", các dòng 2.2.0 trong WHAT'S NEW) vẫn kiểm như cũ.
const manifest = JSON.parse(read('public', 'manifest.json') || '{}')
const V = manifest.version ?? ''
const atLeast220 = /^2\.([2-9]|\d\d+)\.\d+$|^([3-9]|\d\d+)\.\d+\.\d+$/.test(V)
const pkg = JSON.parse(read('package.json') || '{}')
const lockRoot = JSON.parse(read('package-lock.json') || '{}')
check('R6.1 manifest / package.json / lock cùng phiên bản ≥ 2.2.0 (R7); quyền không đổi (Chrome không tạm tắt extension khi cập nhật)',
  atLeast220 && pkg.version === V && lockRoot.version === V && lockRoot.packages?.['']?.version === V &&
    JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'clipboardWrite', 'offscreen', 'bookmarks', 'downloads']),
  `${manifest.version}/${pkg.version}/${lockRoot.version}`)

const readme = read('README.md')
const sec = readme.slice(readme.indexOf('## What changed in 2.2.0'), readme.indexOf('## What changed in 2.1.2'))
check('R6.2 README: Version = phiên bản hiện tại (R7) + "What changed in 2.2.0" (mục lục, trước 2.1.2) nói xóa tất cả bookmark / thanh địa chỉ / thư mục bảo mật 600.000 / đổi ở máy khác',
  readme.includes(`**Version:** ${V}`) && /\[What changed in 2\.2\.0\]\(#what-changed-in-220\)/.test(readme) &&
    readme.indexOf('## What changed in 2.2.0') > 0 && sec.length > 0 && /bookmark/i.test(sec) && /DELETE|XOA/.test(sec) &&
    /address[- ]bar|omnibox/i.test(sec) && /600,000|600\.000|600 000/.test(sec) && /another device/i.test(sec),
  'README')

const txt = read('docs', 'chrome-store-detailed-description.txt')
const news = txt.slice(txt.indexOf("WHAT'S NEW"), txt.indexOf("WHAT'S NEW") + 2000)
check("R6.3 Store: WHAT'S NEW bản hiện tại (R7) còn xóa bookmark an toàn, thanh địa chỉ riêng tư, thư mục bảo mật mạnh hơn — vẫn giữ sao lưu ra file",
  txt.includes(`WHAT'S NEW IN ${V}`) && /bookmark/i.test(news) && /address[- ]bar/i.test(news) && /secure folder/i.test(news) &&
    /Backup files for use without an account/.test(news),
  'chrome-store-detailed-description.txt')
check('R6.4 Release 2.2.0 (highlights) trong listing; permissions doc / DESIGN = phiên bản hiện tại (R7)',
  /Release 2\.2\.0 \(highlights\)/.test(read('docs', 'CHROME-STORE-LISTING.md')) && read('docs', 'CHROME-STORE-PERMISSIONS.md').includes(`**v${V}**`) &&
    read('DESIGN.md').includes(`\nversion: ${V}\n`),
  'docs')
check('R6.5 SECURITY.md ghi chốt salt + 600.000 vòng cho thư mục bảo mật (S9)',
  /S9/.test(read('SECURITY.md')) && /600[.,]000|600_000/.test(read('SECURITY.md')) && /salt/i.test(read('SECURITY.md')),
  'SECURITY.md')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R6-release-2.2.0.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R6 đúng spec.')
