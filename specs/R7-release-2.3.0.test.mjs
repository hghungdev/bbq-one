/**
 * FAILING TEST — R7: phát hành 2.3.0 (S2 xác thực 2 bước TOTP tùy chọn + RLS aal2). Quyền không đổi.
 *
 * Chạy:   node specs/R7-release-2.3.0.test.mjs
 * GREEN sau khi áp specs/R7-release-2.3.0.spec.md.
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

console.log('R7 — phát hành 2.3.0')
const V = '2.3.0'
const manifest = JSON.parse(read('public', 'manifest.json') || '{}')
const pkg = JSON.parse(read('package.json') || '{}')
const lockRoot = JSON.parse(read('package-lock.json') || '{}')
check('R7.1 manifest / package.json / lock = 2.3.0; quyền không đổi',
  manifest.version === V && pkg.version === V && lockRoot.version === V && lockRoot.packages?.['']?.version === V &&
    JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'clipboardWrite', 'offscreen', 'bookmarks', 'downloads']),
  `${manifest.version}/${pkg.version}/${lockRoot.version}`)

const readme = read('README.md')
const sec = readme.slice(readme.indexOf('## What changed in 2.3.0'), readme.indexOf('## What changed in 2.2.0'))
check('R7.2 README: Version 2.3.0 + "What changed in 2.3.0" (mục lục, trước 2.2.0) nói two-step / authenticator / optional / migration 019',
  readme.includes(`**Version:** ${V}`) && /\[What changed in 2\.3\.0\]\(#what-changed-in-230\)/.test(readme) &&
    readme.indexOf('## What changed in 2.3.0') > 0 && sec.length > 0 && /two-step/i.test(sec) && /authenticator/i.test(sec) &&
    /optional/i.test(sec) && /019_mfa_enforce/.test(sec),
  'README')

const txt = read('docs', 'chrome-store-detailed-description.txt')
const news = txt.slice(txt.indexOf("WHAT'S NEW"), txt.indexOf("WHAT'S NEW") + 2200)
check("R7.3 Store: WHAT'S NEW IN 2.3.0 có xác thực 2 bước, vẫn giữ các dòng 2.2.0 + sao lưu ra file",
  txt.includes(`WHAT'S NEW IN ${V}`) && /two-step verification/i.test(news) && /bookmark/i.test(news) && /Backup files for use without an account/.test(news),
  'chrome-store-detailed-description.txt')
check('R7.4 Release 2.3.0 (highlights); permissions doc **v2.3.0**; DESIGN 2.3.0',
  /Release 2\.3\.0 \(highlights\)/.test(read('docs', 'CHROME-STORE-LISTING.md')) && read('docs', 'CHROME-STORE-PERMISSIONS.md').includes(`**v${V}**`) &&
    read('DESIGN.md').includes(`\nversion: ${V}\n`),
  'docs')
const secMd = read('SECURITY.md')
check('R7.5 SECURITY.md: mục 2FA (S2) — RLS aal2, migration 019, thứ tự bật (TOTP dashboard → mọi máy 2.3.0 → migration → bật 2FA)',
  /S2/.test(secMd) && /aal2/.test(secMd) && /019_mfa_enforce/.test(secMd) && /2\.3\.0/.test(secMd),
  'SECURITY.md')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R7-release-2.3.0.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R7 đúng spec.')
