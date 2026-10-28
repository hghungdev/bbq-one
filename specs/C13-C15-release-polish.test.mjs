/**
 * FAILING TEST — C13–C15: ba lỗi nhỏ sửa trước khi lên Store.
 *
 * Chạy:   node specs/C13-C15-release-polish.test.mjs
 * GREEN sau khi áp specs/C13-C15-release-polish.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')
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
/** Nạp module TS thật (không import ngoài, trừ type). */
function load(rel, globals = {}) {
  const src = read(...rel.split('/'))
  if (!src) return null
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} }
  const names = Object.keys(globals)
  new Function('module', 'exports', 'require', ...names, js)(mod, mod.exports, () => ({}), ...names.map((n) => globals[n]))
  return mod.exports
}

console.log('C13 — nhãn Section không dính chữ')
// document giả: innerHTML lưu chuỗi; textContent = bỏ thẻ + giải mã &lt; &gt; &amp; (đủ cho kiểm thử)
const fakeDocument = {
  createElement: () => {
    let html = ''
    return {
      set innerHTML(v) { html = v },
      get textContent() { return html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') },
    }
  },
}
const text = load('src/utils/text.ts', { document: fakeDocument })
const cases = [
  ['<p>Small helper used by the search boxes.</p><pre><code>export function x() {}</code></pre>', 'Small helper used by the search boxes. export function x() {}'],
  ['<h2>Sprint</h2><ul><li><p>Ship</p></li><li><p>Docs</p></li></ul>', 'Sprint Ship Docs'],
  ['<p>a<br>b</p><p>c</p>', 'a b c'],
  ['<pre><code>if (a &lt;/p&gt; b)</code></pre>', 'if (a </p> b)'],
  ['<p>one <strong>bold</strong> word</p>', 'one bold word'],
]
check(
  'C13.1 plainTextFromHtml: khối liền nhau cách nhau một khoảng trắng; chữ trong khối giữ nguyên',
  !!text && typeof text.spaceBlockBoundaries === 'function' && cases.every(([i, o]) => text.plainTextFromHtml(i) === o),
  text ? cases.map(([i]) => JSON.stringify(text.plainTextFromHtml(i))).join(' | ') : 'không nạp được',
)

console.log('\nC14 — Esc đóng hộp Đăng nhập')
const lm = read('src', 'components', 'auth', 'LoginModal.vue')
const lmScript = lm.slice(0, lm.indexOf('<template>'))
check(
  'C14.1 mở → focus ô Email; Esc (window keydown) → stopPropagation + emit close, bỏ qua khi đang gửi; gỡ listener khi đóng',
  /onMounted\(/.test(lmScript) && /emailRef\.value\?\.focus\(\)/.test(lmScript) && /ref="emailRef"/.test(lm) &&
    /window\.addEventListener\('keydown', onKeydown\)/.test(lmScript) &&
    /window\.removeEventListener\('keydown', onKeydown\)/.test(lmScript) && /onBeforeUnmount\(/.test(lmScript) &&
    /e\.key !== 'Escape'/.test(lmScript) && /e\.stopPropagation\(\)/.test(lmScript) && /if \(loading\.value\) return/.test(lmScript),
  'chưa xử lý Esc / focus',
)

console.log('\nC15 — cây Bookmark không còn "(no name)" ở gốc')
const bt = load('src/utils/bookmarkTree.ts')
const root = [{ id: '0', title: '', children: [{ id: '1', title: 'Bookmarks bar', children: [] }, { id: '2', title: 'Other bookmarks', children: [] }] }]
const already = [{ id: '1', title: 'Bookmarks bar', children: [] }]
const named = [{ id: '9', title: 'Work', children: [{ id: '10', title: 'GitHub', url: 'https://github.com' }] }]
check(
  'C15.1 unwrapBookmarkRoot: gốc không tên → các con; cây đã mở / thư mục có tên → giữ nguyên',
  !!bt && JSON.stringify(bt.unwrapBookmarkRoot(root).map((n) => n.title)) === '["Bookmarks bar","Other bookmarks"]' &&
    bt.unwrapBookmarkRoot(already) === already && bt.unwrapBookmarkRoot(named) === named && bt.unwrapBookmarkRoot([]).length === 0,
  bt ? 'kết quả sai' : 'chưa có src/utils/bookmarkTree.ts',
)
const tab = read('src', 'components', 'bookmarks', 'BookmarkTab.vue')
const svc = read('src', 'services', 'bookmarks.service.ts')
check(
  'C15.2 dùng khi hiển thị cây + đường dẫn tìm kiếm (không đổi dữ liệu sao lưu / xuất HTML)',
  /filterBookmarkTreeByQuery\(unwrapBookmarkRoot\(treeToShow\.value\)/.test(tab) &&
    /walk\(unwrapBookmarkRoot\(nodes\), ''\)/.test(svc) &&
    /import \{ unwrapBookmarkRoot \} from '@\/utils\/bookmarkTree'/.test(tab + svc),
  'chưa nối vào BookmarkTab / flattenBookmarkUrls',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C13-C15-release-polish.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. C13–C15 đúng spec.')
