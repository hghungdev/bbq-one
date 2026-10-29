/**
 * FAILING TEST — P1: font Inter đóng gói kèm extension, bỏ Google Fonts (index.html, CSP, tài liệu).
 *
 * Chạy:   node specs/P1-self-host-inter-font.test.mjs
 * GREEN sau khi áp specs/P1-self-host-inter-font.spec.md.
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
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p))
const read = (...p) => (exists(...p) ? fs.readFileSync(path.join(ROOT, ...p), 'utf8') : '')
const GOOGLE = /fonts\.googleapis\.com|fonts\.gstatic\.com/

check('P1.1 index.html không nạp Google Fonts', !GOOGLE.test(read('index.html')), 'index.html còn link Google Fonts')

const csp = JSON.parse(read('public', 'manifest.json')).content_security_policy?.extension_pages ?? ''
check(
  "P1.2 CSP: không còn host Google Fonts; font-src 'self'; giữ 'wasm-unsafe-eval' + 'unsafe-inline' chỉ ở style-src",
  !GOOGLE.test(csp) && /font-src 'self'/.test(csp) && csp.includes("'wasm-unsafe-eval'") &&
    /style-src[^;]*'unsafe-inline'/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp),
  csp,
)

const css = read('src', 'assets', 'styles', 'fonts.css')
const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1])
const want = ['latin', 'latin-ext', 'vietnamese'].flatMap((s) => ['normal', 'italic'].map((st) => `inter-${s}-opsz-${st}.woff2`))
const found = want.map((file) => {
  const face = faces.find((f) => f.includes(file))
  if (!face) return `${file}: thiếu @font-face`
  const url = face.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/)?.[1] ?? ''
  const abs = path.resolve(ROOT, 'src', 'assets', 'styles', url)
  if (!fs.existsSync(abs)) return `${file}: không có file ${url}`
  if (fs.readFileSync(abs).subarray(0, 4).toString('latin1') !== 'wOF2') return `${file}: không phải woff2`
  if (!/font-family:\s*['"]Inter['"]/.test(face)) return `${file}: font-family phải là 'Inter'`
  if (!/font-style:\s*(normal|italic)/.test(face) || !face.includes(file.includes('italic') ? 'italic' : 'normal')) return `${file}: font-style sai`
  if (!/font-weight:\s*100 900/.test(face)) return `${file}: thiếu font-weight 100 900`
  if (!/unicode-range:/.test(face)) return `${file}: thiếu unicode-range`
  if (file.includes('vietnamese') && !face.includes('U+1EA0-1EF9')) return `${file}: unicode-range không phủ tiếng Việt`
  return null
}).filter(Boolean)
check('P1.3 fonts.css: 6 @font-face Inter (latin / latin-ext / vietnamese × normal / italic), file woff2 thật', faces.length === 6 && found.length === 0, found.join('; ') || `${faces.length} @font-face`)

const main = read('src', 'main.ts')
const iFonts = main.indexOf("import './assets/styles/fonts.css'")
check('P1.4 main.ts import fonts.css trước global.css', iFonts !== -1 && iFonts < main.indexOf("import './assets/styles/global.css'"), 'chưa import fonts.css')

check('P1.5 kèm giấy phép SIL OFL 1.1', /SIL Open Font License/.test(read('src', 'assets', 'fonts', 'inter', 'OFL.txt')), 'thiếu src/assets/fonts/inter/OFL.txt')

const docs = ['docs/CHROME-STORE-PERMISSIONS.md', 'docs/CHROME-STORE-LISTING.md', 'docs/chrome-store-detailed-description.txt', 'SECURITY.md', 'DESIGN.md']
const stale = docs.filter((d) => /Google Fonts|fonts\.googleapis|fonts\.gstatic/.test(read(...d.split('/'))))
check('P1.6 tài liệu Store / SECURITY / DESIGN không còn nói extension nạp Google Fonts', stale.length === 0, stale.join(', '))

const policyBody = read('docs', 'privacy-policy.html').split('</head>')[1] ?? ''
check(
  'P1.7 privacy policy: bỏ Google Fonts khỏi danh sách bên thứ ba; nói rõ font đóng gói kèm',
  !/Google Fonts|fonts\.googleapis|fonts\.gstatic/.test(policyBody) && /font[^.<]*bundled|bundled[^.<]*font/i.test(policyBody),
  'privacy policy còn Google Fonts hoặc thiếu câu font đóng gói kèm',
)
check('P1.8 README: chế độ không đăng nhập "No network requests are made" (giờ đã đúng)', /No network requests are made\./.test(read('README.md')), 'README mất câu')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/P1-self-host-inter-font.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. P1 đúng spec.')
