/**
 * FAILING TEST — T3: CI GitHub Actions + Dependabot (SEC-10) và phát hành 2.1.2 (thư viện sạch: Tiptap 3, vite 6).
 *
 * Chạy:   node specs/T3-ci.test.mjs
 * GREEN sau khi áp specs/T3-ci.spec.md.
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

// ── T3 CI ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('T3 — CI (.github/workflows/ci.yml)')
const ci = read('.github', 'workflows', 'ci.yml')
check('T3.1 ci.yml chạy khi push main, pull_request và hằng tuần (schedule cron)',
  ci !== '' && /\bon:\s*\n/.test(ci) && /push:\s*\n\s+branches:\s*\[\s*main\s*\]/.test(ci) && /\n\s+pull_request:/.test(ci) && /schedule:\s*\n\s+-\s*cron:\s*'[^']+'/.test(ci),
  ci ? 'thiếu trigger' : 'chưa có file')
check('T3.2 quyền tối thiểu: permissions contents: read; checkout persist-credentials: false; có timeout',
  /\npermissions:\s*\n\s+contents:\s*read\b/.test(ci) && /persist-credentials:\s*false/.test(ci) && /timeout-minutes:\s*\d+/.test(ci) &&
    !/contents:\s*write|pull_request_target|secrets\./.test(ci),
  'permissions / persist-credentials / timeout')
const steps = ['npm ci', 'npm audit --omit=dev --audit-level=moderate', 'npm audit --audit-level=high', 'cp .env.example .env', 'npm run build']
const missing = steps.filter((s) => !ci.includes(s))
const order = steps.map((s) => ci.indexOf(s))
const loopAt = ci.search(/for f in specs\/\*\.test\.mjs/)
check('T3.3 các bước: npm ci → audit bản đóng gói (từ mức vừa) → audit công cụ build (từ mức cao) → build (.env.example) → mọi specs/*.test.mjs',
  missing.length === 0 && order.every((v, i) => i === 0 || v > order[i - 1]) && loopAt > order[order.length - 1] && /exit \$fail/.test(ci),
  missing.length ? `thiếu: ${missing.join(' | ')}` : 'sai thứ tự / thiếu vòng test')
const uses = [...ci.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1])
check('T3.4 chỉ dùng action chính chủ GitHub (actions/*) — không action bên thứ ba',
  uses.length >= 2 && uses.every((u) => /^actions\/[\w-]+@v\d+$/.test(u)),
  uses.join(', ') || 'không có uses')

console.log('\nT3 — Dependabot (.github/dependabot.yml)')
const dep = read('.github', 'dependabot.yml')
check('T3.5 dependabot: version 2; npm (weekly, nhóm @tiptap/*) + github-actions',
  /^version:\s*2\b/m.test(dep) && /package-ecosystem:\s*npm/.test(dep) && /package-ecosystem:\s*github-actions/.test(dep) &&
    /interval:\s*weekly/.test(dep) && /'@tiptap\/\*'/.test(dep),
  dep ? 'thiếu mục' : 'chưa có file')

// ── Phát hành 2.1.2 ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT3 — phát hành 2.1.2')
// R6 (đổi có chủ đích, 2.2.0): chỗ ghi "phiên bản hiện tại" kiểm theo manifest (≥ 2.1.2); phần lịch sử 2.1.2 (README
// "What changed in 2.1.2", "Release 2.1.2 (highlights)", dòng Security thư viện trong WHAT'S NEW) vẫn kiểm như cũ.
const manifest = JSON.parse(read('public', 'manifest.json') || '{}')
const V = manifest.version ?? ''
const atLeast212 = /^2\.1\.([2-9]|\d\d+)$|^2\.([2-9]|\d\d+)\.\d+$|^([3-9]|\d\d+)\.\d+\.\d+$/.test(V)
const pkg = JSON.parse(read('package.json') || '{}')
const lockRoot = JSON.parse(read('package-lock.json') || '{}')
check('T3.6 manifest / package.json / lock cùng phiên bản ≥ 2.1.2 (R6); quyền không đổi',
  atLeast212 && pkg.version === V && lockRoot.version === V && lockRoot.packages?.['']?.version === V &&
    JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'clipboardWrite', 'offscreen', 'bookmarks', 'downloads']),
  `${manifest.version}/${pkg.version}/${lockRoot.version}`)
const readme = read('README.md')
const sec = readme.slice(readme.indexOf('## What changed in 2.1.2'), readme.indexOf('## What changed in 2.1.1'))
check('T3.7 README: Version = phiên bản hiện tại (R6) + "What changed in 2.1.2" (mục lục, trước 2.1.1) nói Tiptap 3 / vite 6 / CI',
  readme.includes(`**Version:** ${V}`) && /\[What changed in 2\.1\.2\]\(#what-changed-in-212\)/.test(readme) &&
    readme.indexOf('## What changed in 2.1.2') > 0 && sec.length > 0 && /Tiptap 3/.test(sec) && /vite 6/i.test(sec) && /CI|GitHub Actions/.test(sec) && /Dependabot/.test(sec),
  'README')
const txt = read('docs', 'chrome-store-detailed-description.txt')
const news = txt.slice(txt.indexOf("WHAT'S NEW"), txt.indexOf("WHAT'S NEW") + 1500)
check("T3.8 Store: WHAT'S NEW bản hiện tại (R6) còn dòng Security thư viện + kiểm tự động và sao lưu ra file; Release 2.1.2 (highlights); permissions doc / DESIGN = phiên bản hiện tại",
  txt.includes(`WHAT'S NEW IN ${V}`) && /Security:.*(librar|editor).*(automat|check)/i.test(news) && /Backup files for use without an account/.test(news) &&
    /Release 2\.1\.2 \(highlights\)/.test(read('docs', 'CHROME-STORE-LISTING.md')) && read('docs', 'CHROME-STORE-PERMISSIONS.md').includes(`**v${V}**`) &&
    read('DESIGN.md').includes(`\nversion: ${V}\n`),
  'docs')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/T3-ci.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. T3 đúng spec.')
