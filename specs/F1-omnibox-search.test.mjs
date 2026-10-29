/**
 * FAILING TEST — F1: tìm ghi chú từ thanh địa chỉ (`bbq …`) — Enter mở, Alt+Enter sao chép cả ghi chú.
 *
 * Chạy:   node specs/F1-omnibox-search.test.mjs
 * GREEN sau khi áp specs/F1-omnibox-search.spec.md.
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
function load(rel, mocks = {}) {
  const src = read(...rel.split('/'))
  if (!src) throw new Error(`chưa có ${rel}`)
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  const req = (s) => {
    if (s in mocks) return mocks[s]
    throw new Error(`Unmocked import in ${path.basename(rel)}: ${s}`)
  }
  // KHÔNG có document — đúng môi trường service worker.
  new Function('require', 'module', 'exports', 'document', js)(req, mod, mod.exports, undefined)
  return mod.exports
}

let O = null
try {
  O = load('src/utils/omniboxNotes.ts', { '@/utils/secureCrypto': load('src/utils/secureCrypto.ts') })
} catch (e) {
  check('F1.0 src/utils/omniboxNotes.ts tồn tại', false, e.message)
}

const T = (d) => `2026-10-${String(d).padStart(2, '0')}T00:00:00.000Z`
const note = (id, title, d, folder_id = 'f1', tags = []) => ({ id, user_id: '', folder_id, title, tags, created_at: T(1), updated_at: T(d), synced_at: null })
const body = (note_id, content, position = 0, label = '') => ({ id: `${note_id}-b${position}`, user_id: '', note_id, label, content, position, created_at: T(1), updated_at: T(1), synced_at: null })
const ENVELOPE = 'retronote:1:abc'

if (O) {
  console.log('T1 — HTML → chữ không cần DOM')
  const html = '<p>Hello <strong>A&amp;B</strong></p><pre><code class="language-sql">SELECT 1;\nSELECT 2;</code></pre><ul><li><p>x</p></li><li><p>y</p></li></ul><p>a<br>b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#8211; &#x2014;&nbsp;f</p><p></p><p></p>'
  const want = 'Hello A&B\nSELECT 1;\nSELECT 2;\nx\ny\na\nb <c> "d" \'e\' – — f'
  check('F1.1 htmlToTextNoDom: khối → xuống dòng, code giữ xuống dòng, giải mã entity, bỏ dòng trống thừa', O.htmlToTextNoDom?.(html) === want, JSON.stringify(O.htmlToTextNoDom?.(html)))

  console.log('\nT2 — sao chép cả ghi chú')
  const copy = O.noteCopyText?.([body('n1', '<p>Phần hai</p>', 1), body('n1', '<p>Phần một</p><p>dòng 2</p>', 0), body('n1', '<p></p>', 2)])
  check('F1.2 noteCopyText: mọi section theo position, cách 1 dòng trống, bỏ section rỗng', copy === 'Phần một\ndòng 2\n\nPhần hai', JSON.stringify(copy))

  console.log('\nT3 — tìm + xếp hạng')
  const folders = [{ id: 'f1', name: 'Work', is_secure: false }, { id: 'fs', name: 'Secret', is_secure: true }]
  const notes = [
    note('a1111111-0000', 'Kafka plan', 3),
    note('b2222222-0000', 'Other', 9),
    note('c3333333-0000', 'Kafka newer', 8),
    note('d4444444-0000', 'Kafka secret', 10, 'fs'),
    note('e5555555-0000', ENVELOPE, 11),
    note('f6666666-0000', 'Bold only', 12),
  ]
  const bodies = [
    body('a1111111-0000', '<p>plan</p>'),
    body('b2222222-0000', '<p>the kafka consumer commits offsets</p>'),
    body('c3333333-0000', '<p>x</p>'),
    body('d4444444-0000', '<p>kafka</p>'),
    body('e5555555-0000', '<p>kafka</p>'),
    body('f6666666-0000', '<p><strong>nothing</strong></p>'),
  ]
  const ids = (q, limit) => (O.searchNotesForOmnibox?.({ notes, bodies, folders, query: q, limit }) ?? []).map((h) => h.note.id.slice(0, 1)).join('')
  check('F1.3 khớp tên trước (mới trước), rồi nội dung; bỏ thư mục bảo mật + ghi chú khóa', ids('kafka') === 'cab', ids('kafka'))
  check('F1.4 không khớp thẻ HTML ("strong"); giới hạn số gợi ý; query rỗng → []', ids('strong') === '' && ids('kafka', 2) === 'ca' && ids('  ') === '', `${ids('strong')} / ${ids('kafka', 2)}`)
  const hitB = (O.searchNotesForOmnibox?.({ notes, bodies, folders, query: 'kafka' }) ?? []).find((h) => h.note.id.startsWith('b'))
  check('F1.5 đoạn trích quanh chữ khớp trong nội dung', !!hitB && /kafka consumer/.test(hitB.snippet) && hitB.titleMatch === false, JSON.stringify(hitB))

  console.log('\nT4 — dòng gợi ý (XML của Chrome)')
  const d = O.omniboxDescription?.({ note: note('x', 'A <b> & Kafka', 1), snippet: 'x < y & "z"', titleMatch: true }, 'Work & Co', 'kafka', 'Untitled')
  check(
    'F1.6 escape & < > " \', <match> quanh chữ khớp trong tên, <dim> thư mục + đoạn trích',
    d === 'A &lt;b&gt; &amp; <match>Kafka</match> <dim>— Work &amp; Co · x &lt; y &amp; &quot;z&quot;</dim>',
    d,
  )
  const d2 = O.omniboxDescription?.({ note: note('y', '', 1), snippet: '', titleMatch: false }, null, 'q', 'Untitled')
  check('F1.7 không tên / không thư mục / không đoạn trích → "Untitled" gọn', d2 === 'Untitled', d2)

  console.log('\nT5 — nhận lại ghi chú từ gợi ý')
  const content = O.omniboxContent?.(notes[0], 'Untitled')
  check(
    'F1.8 content = "Tên #<8 ký tự id>"; resolve → id; chữ gõ thường → null; không tên → "Untitled #…"',
    content === 'Kafka plan #a1111111' && O.resolveOmniboxNoteId?.(content, notes) === 'a1111111-0000' &&
      O.resolveOmniboxNoteId?.('kafka', notes) === null && O.resolveOmniboxNoteId?.('x #deadbeef', notes) === null &&
      O.omniboxContent?.(note('99999999-1', '  ', 1), 'Untitled') === 'Untitled #99999999',
    content,
  )
  check(
    'F1.9 route: /dashboard?note=<id> · /dashboard?q=<encode>',
    O.omniboxNoteRoute?.('a1111111-0000') === '/dashboard?note=a1111111-0000' && O.omniboxSearchRoute?.('kafka plan & co') === '/dashboard?q=kafka%20plan%20%26%20co',
    `${O.omniboxNoteRoute?.('a')} ${O.omniboxSearchRoute?.('a b')}`,
  )
}

console.log('\nT6 — nối dây (tĩnh)')
const manifest = JSON.parse(read('public', 'manifest.json'))
check('F1.10 manifest: omnibox.keyword = "bbq"; quyền không đổi', manifest.omnibox?.keyword === 'bbq' &&
  JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'clipboardWrite', 'offscreen', 'bookmarks', 'downloads']),
  JSON.stringify(manifest.omnibox))
const bg = read('src', 'background.ts')
check(
  'F1.11 background: onInputChanged + onInputEntered; Alt+Enter (disposition ≠ currentTab) → copyViaOffscreen(noteCopyText) + badge ✓; Enter → openPopupAt(route)',
  /chrome\.omnibox\.onInputChanged\.addListener/.test(bg) && /chrome\.omnibox\.onInputEntered\.addListener/.test(bg) &&
    /disposition !== 'currentTab'/.test(bg) && /copyViaOffscreen\(noteCopyText\(/.test(bg) && /setBadgeText\(\{ text: ok \? '✓' : '!' \}\)/.test(bg) &&
    /openPopupAt\(/.test(bg) && /omniboxNoteRoute\(/.test(bg) && /omniboxSearchRoute\(/.test(bg) && /chrome\.tabs\.create\(/.test(bg),
  'thiếu nối dây omnibox',
)
check(
  'F1.12 background: một đường offscreen dùng chung (copyViaOffscreen), vẫn withWebLock(OFFSCREEN_CLIPBOARD_LOCK (N13)',
  /async function copyViaOffscreen\(/.test(bg) && (bg.match(/chrome\.offscreen\.createDocument/g) ?? []).length === 1 && bg.includes('withWebLock(OFFSCREEN_CLIPBOARD_LOCK') &&
    /isCopyToOsClipboardMessage[\s\S]*?copyViaOffscreen\(/.test(bg),
  'đường offscreen chưa dùng chung',
)
const app = read('src', 'pages', 'App.vue')
check(
  'F1.13 pages/App.vue: ?note= → tab Ghi chú + selectNote; ?q= → tab Ghi chú + runSearch; rồi router.replace',
  /route\.query\.note/.test(app) && /route\.query\.q/.test(app) && /notes\.selectNote\(noteId\)/.test(app) && /notes\.runSearch\(/.test(app) &&
    /router\.replace\(\{ path: '\/dashboard' \}\)/.test(app),
  'popup chưa nhận route của thanh địa chỉ',
)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
check('F1.14 i18n vi + en: omnibox.default, omnibox.noResults (có %s)', ['omnibox.default', 'omnibox.noResults'].every((k) => new RegExp(`'${k.replace('.', '\\.')}': '[^']*%s`).test(vi) && new RegExp(`'${k.replace('.', '\\.')}': '[^']*%s`).test(en)), 'thiếu chuỗi')
check('F1.15 README nói cách dùng `bbq` (Enter mở, Alt+Enter sao chép)', /`bbq`/.test(read('README.md')) && /Alt\+Enter/.test(read('README.md')), 'README chưa có')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/F1-omnibox-search.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. F1 đúng spec.')
