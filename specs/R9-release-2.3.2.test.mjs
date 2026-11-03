/**
 * FAILING TEST — R9: phát hành 2.3.2 (F4 thanh địa chỉ theo section + B2 sao lưu ra file mặc định bằng tay). Quyền không đổi.
 *
 * Chạy:   node specs/R9-release-2.3.2.test.mjs
 * GREEN sau khi áp specs/R9-release-2.3.2.spec.md.
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

console.log('R9 — phát hành 2.3.2')
const V = '2.3.2'
const manifest = JSON.parse(read('public', 'manifest.json') || '{}')
const pkg = JSON.parse(read('package.json') || '{}')
const lockRoot = JSON.parse(read('package-lock.json') || '{}')
check('R9.1 manifest / package.json / lock = 2.3.2; quyền không đổi',
  manifest.version === V && pkg.version === V && lockRoot.version === V && lockRoot.packages?.['']?.version === V &&
    JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'clipboardWrite', 'offscreen', 'bookmarks', 'downloads']),
  `${manifest.version}/${pkg.version}/${lockRoot.version}`)
const readme = read('README.md')
const sec = readme.slice(readme.indexOf('## What changed in 2.3.2'), readme.indexOf('## What changed in 2.3.1'))
check('R9.2 README: Version 2.3.2 + "What changed in 2.3.2" (mục lục, trước 2.3.1) nói section / Alt+Enter / Back up now / off by default',
  readme.includes(`**Version:** ${V}`) && /\[What changed in 2\.3\.2\]\(#what-changed-in-232\)/.test(readme) &&
    readme.indexOf('- [What changed in 2.3.2]') < readme.indexOf('- [What changed in 2.3.1]') &&
    readme.indexOf('## What changed in 2.3.2') > 0 && sec.length > 0 && /section/i.test(sec) && /Alt\+Enter/.test(sec) &&
    /Back up now/.test(sec) && /off by default/i.test(sec),
  'README')
const txt = read('docs', 'chrome-store-detailed-description.txt')
const at = txt.indexOf(`WHAT'S NEW IN ${V}`)
const newest = at < 0 ? '' : txt.slice(at, txt.indexOf('Earlier (2.1', at))
const listing = read('docs', 'CHROME-STORE-LISTING.md')
check("R9.3 Store: WHAT'S NEW IN 2.3.2 — 2 dòng mới (section, sao lưu mặc định tắt) trước \"Earlier (2.1 – 2.3.1)\"; Release 2.3.2 (highlights) trước 2.3.1; permissions **v2.3.2**; DESIGN 2.3.2",
  at > 0 && newest.length > 0 && /section/i.test(newest) && /Alt\+Enter/.test(newest) && /Back up now/.test(newest) && /off by default/i.test(newest) &&
    /Release 2\.3\.2 \(highlights\)/.test(listing) && listing.indexOf('Release 2.3.2') < listing.indexOf('Release 2.3.1') &&
    read('docs', 'CHROME-STORE-PERMISSIONS.md').includes(`**v${V}**`) && read('DESIGN.md').includes(`\nversion: ${V}\n`),
  'docs')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R9-release-2.3.2.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R9 đúng spec.')
