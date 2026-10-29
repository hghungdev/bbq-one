/**
 * FAILING TEST — P4: tìm ghi chú nhanh + đúng — trên RAM, trên chữ (không khớp thẻ HTML), server chỉ khi đăng nhập.
 *
 * Chạy:   node specs/P4-note-search-fast.test.mjs
 * GREEN sau khi áp specs/P4-note-search-fast.spec.md.
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
function load(rel, mocks = {}, globals = {}) {
  const src = read(...rel.split('/'))
  if (!src) throw new Error(`chưa có ${rel}`)
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  const requireShim = (spec) => {
    if (spec in mocks) return mocks[spec]
    throw new Error(`Unmocked import in ${path.basename(rel)}: ${spec}`)
  }
  const names = Object.keys(globals)
  new Function('require', 'module', 'exports', ...names, js)(requireShim, mod, mod.exports, ...names.map((n) => globals[n]))
  return mod.exports
}

// document giả (như C13): bỏ thẻ + giải mã &lt; &gt; &amp;
const fakeDocument = {
  createElement: () => {
    let html = ''
    return {
      set innerHTML(v) { html = v },
      get textContent() { return html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') },
    }
  },
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — utils/noteSearch.ts filterNotesByText (CODE THẬT + text.ts thật)')
let TX = null
let NS = null
try {
  TX = load('src/utils/text.ts', {}, { document: fakeDocument })
  NS = load('src/utils/noteSearch.ts', { '@/utils/text': TX })
} catch (e) {
  check('T1.0 src/utils/noteSearch.ts tồn tại', false, e.message)
}
const note = (id, title, tags = []) => ({ id, title, tags, folder_id: 'f', updated_at: '2026-10-29T00:00:00.000Z' })
const body = (note_id, content, label = '', position = 0) => ({ id: `b-${note_id}-${position}`, note_id, label, content, position })
const notes = [note('A', 'Meeting'), note('B', 'Coffee'), note('C', 'Link'), note('D', '', ['Work']), note('E', 'Đường đi')]
const bodies = [
  body('A', '<p><strong>Bold</strong> plan</p>'),
  body('B', '<p>strong coffee</p>'),
  body('C', '<p><a href="https://x.com" class="lnk">site</a> <span>ok</span></p>'),
  body('D', '<p>Tom &amp; Jerry</p>'),
  body('E', '<pre><code class="language-sql">SELECT 1</code></pre>', 'Query'),
]
const index = new Map()
for (const b of bodies) index.set(b.note_id, [...(index.get(b.note_id) ?? []), b])
if (NS?.filterNotesByText && TX?.bodySearchText) {
  const ids = (q) => NS.filterNotesByText(notes, index, q).map((n) => n.id).join(',')
  const cases = [
    ['strong', 'B'],
    ['class', ''],
    ['href', ''],
    ['span', ''],
    ['language-sql', ''],
    ['site', 'C'],
    ['tom & jerry', 'D'],
    ['WORK', 'D'],
    ['query', 'E'],
    ['ĐƯỜNG', 'E'],
    ['select 1', 'E'],
    ['   meeting  ', 'A'],
    ['e', 'A,B,C,D,E'],
  ]
  const bad = cases.filter(([q, want]) => ids(q) !== want).map(([q, want]) => `"${q}" → [${ids(q)}] (cần [${want}])`)
  check('T1.1 khớp tên / thẻ / nhãn / CHỮ trong body; KHÔNG khớp thẻ HTML; giữ thứ tự; hoa thường như nhau', bad.length === 0, bad.join('; '))
  check('T1.2 query rỗng → []', NS.filterNotesByText(notes, index, '   ').length === 0, 'khác []')

  // 2.000 ghi chú × 2 body: lần đầu dựng plain text, lần sau dùng lại.
  const N = [], IDX = new Map()
  for (let i = 0; i < 2000; i++) {
    N.push(note(`n${i}`, `Note ${i}`))
    IDX.set(`n${i}`, [body(`n${i}`, `<p>lorem ipsum ${i} dolor</p><p><strong>trading</strong> report</p>`, '', 0), body(`n${i}`, '<p>select from where</p>', 'Q', 1)])
  }
  NS.filterNotesByText(N, IDX, 'warm')
  const t0 = performance.now()
  const hits = NS.filterNotesByText(N, IDX, 'trading report').length
  const ms = performance.now() - t0
  check('T1.3 2.000 ghi chú (đã nhớ plain text): < 40 ms', hits === 2000 && ms < 40, `${hits} kết quả, ${ms.toFixed(1)} ms`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — nối dây (tĩnh)')
const store = read('src', 'stores', 'notes.ts')
const run = store.match(/async function runSearch\([\s\S]*?\n  }\n/)?.[0] ?? ''
check(
  'T2.1 runSearch: RAM trước — filterNotesByText(notes.value, bodiesByNote.value, q)',
  /import { filterNotesByText } from '@\/utils\/noteSearch'/.test(store) &&
    /filterNotesByText\(notes\.value, bodiesByNote\.value, q\)/.test(run) && !/filterNotesBySubstring/.test(store),
  'runSearch chưa tìm trên RAM bằng filterNotesByText',
)
const iAuth = run.search(/useAuthStore\(\)\.isAuthenticated/)
const iApi = run.indexOf('notesService.searchFullText(')
check(
  'T2.2 runSearch: chỉ gọi searchFullText khi đăng nhập; searchSeq bỏ kết quả cũ; server lỗi → giữ kết quả RAM (catch)',
  iAuth !== -1 && iApi > iAuth && /searchSeq/.test(run) && /seq !== searchSeq/.test(run) && /catch/.test(run),
  'thiếu guard đăng nhập / searchSeq / catch',
)
const svc = read('src', 'services', 'notes.service.ts')
const sft = svc.match(/async searchFullText\([\s\S]*?\n  },\n/)?.[0] ?? ''
check(
  'T2.3 notes.service searchFullText: chỉ server — không getAll, không lọc cả kho; không đăng nhập → []',
  !!sft && !/getAll\(/.test(sft) && !/filterNotesBySubstring/.test(svc) && /if \(!q \|\| !\(await isAuthenticated\(\)\)\) return \[\]/.test(sft) &&
    /\.map\(acceptServerRow\)/.test(sft),
  'searchFullText vẫn tải cả kho / còn filterNotesBySubstring',
)
let parses = 0
const countingDocument = { createElement: () => { parses++; return fakeDocument.createElement() } }
const TX2 = load('src/utils/text.ts', {}, { document: countingDocument })
const shared = { content: '<p>Xin <b>Chào</b></p>' }
const plain = TX2.bodyPlainText?.(shared)
const lower = TX2.bodySearchText?.(shared)
const again = TX2.bodySearchText?.(shared)
check(
  'T2.4 text.ts: bodySearchText = chữ thường của bodyPlainText, dùng chung bộ nhớ (cả hai chỉ dựng DOM 1 lần)',
  plain === 'Xin Chào' && lower === 'xin chào' && again === lower && parses === 1,
  `plain=${plain} lower=${lower} parses=${parses}`,
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/P4-note-search-fast.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. P4 đúng spec.')
