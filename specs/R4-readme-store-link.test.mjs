/**
 * FAILING TEST — R4: README trỏ tới listing Chrome Web Store (2.0.0 đã lên Store).
 *
 * Chạy:   node specs/R4-readme-store-link.test.mjs
 * GREEN sau khi áp specs/R4-readme-store-link.spec.md.
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
const STORE = 'https://chromewebstore.google.com/detail/bbqone/ceapgalokgiaajogfjjkcaidnkpmplll'

const readme = read('README.md')
const install = readme.split(/^## Install$/m)[1]?.split(/^---$/m)[0] ?? ''
check(
  'R4.1 Install: link thật tới listing; hết "when the listing is published"',
  install.includes(`](${STORE})`) && !/when the listing is published/.test(readme),
  'mục Install chưa có link Store',
)
const head = readme.split(/^## Table of contents$/m)[0]
check(
  'R4.2 đầu trang: badge tĩnh shields.io "Chrome Web Store" trỏ tới listing',
  new RegExp(`\\[!\\[Chrome Web Store\\]\\(https://img\\.shields\\.io/badge/[^)]+\\)\\]\\(${STORE.replace(/[.]/g, '\\.')}\\)`).test(head),
  'chưa có badge trước Table of contents',
)
const links = readme.match(/https:\/\/chromewebstore\.google\.com\/[^\s)"]*/g) ?? []
check(
  'R4.3 link Store không mang tham số tài khoản / ngôn ngữ (authuser, hl)',
  links.length > 0 && links.every((u) => u === STORE),
  links.join(', ') || 'không có link',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R4-readme-store-link.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R4 đúng spec.')
