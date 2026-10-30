/**
 * FAILING TEST — R8: phát hành 2.3.1 (SEC-13 đổi khóa thư mục bảo mật nguyên tử). Quyền không đổi.
 *
 * Chạy:   node specs/R8-release-2.3.1.test.mjs
 * GREEN sau khi áp specs/R8-release-2.3.1.spec.md.
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

console.log('R8 — phát hành 2.3.1')
const V = '2.3.1'
const manifest = JSON.parse(read('public', 'manifest.json') || '{}')
const pkg = JSON.parse(read('package.json') || '{}')
const lockRoot = JSON.parse(read('package-lock.json') || '{}')
check('R8.1 manifest / package.json / lock = 2.3.1; quyền không đổi',
  manifest.version === V && pkg.version === V && lockRoot.version === V && lockRoot.packages?.['']?.version === V &&
    JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'clipboardWrite', 'offscreen', 'bookmarks', 'downloads']),
  `${manifest.version}/${pkg.version}/${lockRoot.version}`)
const readme = read('README.md')
const sec = readme.slice(readme.indexOf('## What changed in 2.3.1'), readme.indexOf('## What changed in 2.3.0'))
check('R8.2 README: Version 2.3.1 + "What changed in 2.3.1" (mục lục, trước 2.3.0) nói secure folder / connection / 020',
  readme.includes(`**Version:** ${V}`) && /\[What changed in 2\.3\.1\]\(#what-changed-in-231\)/.test(readme) &&
    readme.indexOf('## What changed in 2.3.1') > 0 && sec.length > 0 && /secure folder/i.test(sec) && /connection/i.test(sec) && /020_secure_folder_rekey/.test(sec),
  'README')
const txt = read('docs', 'chrome-store-detailed-description.txt')
const news = txt.slice(txt.indexOf("WHAT'S NEW"), txt.indexOf("WHAT'S NEW") + 2400)
check("R8.3 Store: WHAT'S NEW IN 2.3.1 (dòng sửa thư mục bảo mật), giữ 2FA + sao lưu ra file; Release 2.3.1 (highlights); permissions **v2.3.1**; DESIGN 2.3.1",
  txt.includes(`WHAT'S NEW IN ${V}`) && /secure folder/i.test(news) && /two-step verification/i.test(news) && /Backup files for use without an account/.test(news) &&
    /Release 2\.3\.1 \(highlights\)/.test(read('docs', 'CHROME-STORE-LISTING.md')) && read('docs', 'CHROME-STORE-PERMISSIONS.md').includes(`**v${V}**`) &&
    read('DESIGN.md').includes(`\nversion: ${V}\n`),
  'docs')
const secMd = read('SECURITY.md')
const report = read('specs', 'SEC-REDTEAM-2026-10-30.md')
check('R8.4 SECURITY.md ghi đổi khóa nguyên tử (SEC-13, migration 020); báo cáo red team đánh dấu SEC-13 ✅ 2.3.1',
  /SEC-13/.test(secMd) && /020_secure_folder_rekey/.test(secMd) && /\| SEC-13 \|[^\n]*✅ 2\.3\.1/.test(report),
  'SECURITY.md / SEC-REDTEAM-2026-10-30.md')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R8-release-2.3.1.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R8 đúng spec.')
