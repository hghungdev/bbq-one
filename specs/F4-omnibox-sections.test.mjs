/**
 * FAILING TEST — F4: thanh địa chỉ (`bbq …`) — ghi chú nhiều section → mỗi section một dòng gợi ý; Enter mở đúng
 * section, Alt+Enter chép section đó (F1 gom mọi section vào một dòng).
 *
 * Chạy:   node specs/F4-omnibox-sections.test.mjs
 * GREEN sau khi áp specs/F4-omnibox-sections.spec.md.
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

const O = load('src/utils/omniboxNotes.ts', { '@/utils/secureCrypto': load('src/utils/secureCrypto.ts') })

const T = (d) => `2026-11-${String(d).padStart(2, '0')}T00:00:00.000Z`
const note = (id, title, d, tags = []) => ({ id, user_id: '', folder_id: 'f1', title, tags, created_at: T(1), updated_at: T(d), synced_at: null })
const body = (id, note_id, content, position) => ({ id, user_id: '', note_id, label: '', content, position, created_at: T(1), updated_at: T(1), synced_at: null })
const folders = [{ id: 'f1', name: 'BBQ', is_secure: false }]

// Ghi chú "Contabo" 3 section (section 2 rỗng), viết lộn thứ tự để kiểm sắp theo position.
const NC = 'eeb9ce04-1111-4111-8111-111111111111'
const notes = [note(NC, 'Contabo', 5), note('aa000001-0000-4000-8000-000000000001', 'Other', 9), note('bb000002-0000-4000-8000-000000000002', 'Single', 3)]
const bodies = [
  body('c3c3c3c3-0000-4000-8000-000000000003', NC, '<p>VPS Singapore</p><p>ssh root@sg.example</p>', 2),
  body('c1c1c1c1-0000-4000-8000-000000000001', NC, '<p>VPS Germany</p><p>ssh root@de.example</p>', 0),
  body('c2c2c2c2-0000-4000-8000-000000000002', NC, '<p></p>', 1),
  body('d1d1d1d1-0000-4000-8000-000000000001', 'aa000001-0000-4000-8000-000000000001', '<p>nothing here</p>', 0),
  body('e1e1e1e1-0000-4000-8000-000000000001', 'bb000002-0000-4000-8000-000000000002', '<p>singapore notes</p>', 0),
]
const search = (query, limit) => O.searchNotesForOmnibox({ notes, bodies, folders, query, limit })
const rowKey = (h) => `${h.note.title}${h.section && h.section.count > 1 ? `[${h.section.index}/${h.section.count}]` : ''}`

console.log('T1 — tìm: mỗi section một dòng')
const byTitle = search('conta')
check('F4.1 khớp tên, 3 section (1 rỗng) → 2 dòng theo thứ tự tab ([1/3], [3/3]); đoạn trích chỉ có chữ của section đó',
  byTitle.map(rowKey).join(',') === 'Contabo[1/3],Contabo[3/3]' &&
    /Germany/.test(byTitle[0]?.snippet) && !/Singapore/.test(byTitle[0]?.snippet) &&
    /Singapore/.test(byTitle[1]?.snippet) && !/Germany/.test(byTitle[1]?.snippet) &&
    byTitle[0]?.section?.body?.id === 'c1c1c1c1-0000-4000-8000-000000000001',
  JSON.stringify(byTitle.map((h) => [rowKey(h), h.snippet])))
const byText = search('sg.example')
check('F4.2 chỉ khớp nội dung section 3 → đúng 1 dòng [3/3], đoạn trích quanh chữ khớp',
  byText.length === 1 && rowKey(byText[0]) === 'Contabo[3/3]' && /sg\.example/.test(byText[0].snippet) && byText[0].titleMatch === false,
  JSON.stringify(byText.map((h) => [rowKey(h), h.snippet])))
const sg = search('singapore')
const limited = search('singapore', 1)
check('F4.3 ghi chú 1 section → 1 dòng như F1 (không [i/n]); nhóm mới sửa trước; giới hạn tính trên dòng',
  sg.map(rowKey).join(',') === 'Contabo[3/3],Single' && limited.map(rowKey).join(',') === 'Contabo[3/3]' &&
    search('single').map(rowKey).join(',') === 'Single',
  `${sg.map(rowKey)} / ${limited.map(rowKey)}`)

console.log('\nT2 — dòng gợi ý + content')
const sec2 = { body: bodies[0], index: 2, count: 3 }
const hit = { note: notes[0], section: sec2, snippet: 'VPS <x>', titleMatch: true }
const full = O.omniboxDescription(hit, 'BBQ', 'conta', 'Untitled', 'full')
const titleOnly = O.omniboxDescription(hit, 'BBQ', 'conta', 'Untitled', 'title')
const one = O.omniboxDescription({ ...hit, section: { body: bodies[0], index: 1, count: 1 } }, 'BBQ', 'conta', 'Untitled', 'full')
check('F4.4 description: " [2/3]" sau tên (full + chỉ tên); count 1 → không có',
  full === '<match>Conta</match>bo [2/3] <dim>— BBQ · VPS &lt;x&gt;</dim>' && titleOnly === '<match>Conta</match>bo [2/3]' &&
    one === '<match>Conta</match>bo <dim>— BBQ · VPS &lt;x&gt;</dim>',
  `${full} | ${titleOnly} | ${one}`)
const content = O.omniboxContent(notes[0], 'Untitled', sec2)
check('F4.5 content "Tên [2/3] #note8/body8"; resolve → id ghi chú + id section; đuôi cũ / section lạ → section null',
  content === 'Contabo [2/3] #eeb9ce04/c3c3c3c3' && O.resolveOmniboxNoteId(content, notes) === NC &&
    O.resolveOmniboxBodyId?.(content, NC, bodies) === 'c3c3c3c3-0000-4000-8000-000000000003' &&
    O.resolveOmniboxBodyId?.('Contabo #eeb9ce04', NC, bodies) === null &&
    O.resolveOmniboxBodyId?.('Contabo [2/3] #eeb9ce04/deadbeef', NC, bodies) === null &&
    O.resolveOmniboxBodyId?.('Single [1/2] #bb000002/c3c3c3c3', 'bb000002-0000-4000-8000-000000000002', bodies) === null &&
    O.omniboxContent(notes[0], 'Untitled') === 'Contabo #eeb9ce04',
  content)
check('F4.6 route: omniboxNoteRoute(id, bodyId) → &section=; không bodyId → như F1',
  O.omniboxNoteRoute('n1', 'b1') === '/dashboard?note=n1&section=b1' && O.omniboxNoteRoute('n1') === '/dashboard?note=n1' &&
    O.omniboxNoteRoute('n1', null) === '/dashboard?note=n1',
  O.omniboxNoteRoute('n1', 'b1'))

console.log('\nT3 — nối dây (tĩnh)')
const bg = read('src', 'background.ts')
const changed = (bg.match(/chrome\.omnibox\.onInputChanged\.addListener\([\s\S]*?\n\}\)\n/) || [''])[0]
const entered = (bg.match(/chrome\.omnibox\.onInputEntered\.addListener\([\s\S]*?\n\}\)\n/) || [''])[0]
check('F4.7 background: content theo section; Enter mở đúng section; Alt+Enter chép section (không có → cả ghi chú)',
  /omniboxContent\(h\.note, untitled, h\.section\)/.test(changed) &&
    /const bodyId = noteId \? resolveOmniboxBodyId\(text, noteId, data\.bodies\) : null/.test(entered) &&
    /bodyId \? b\.id === bodyId : b\.note_id === noteId/.test(entered) && /copyViaOffscreen\(noteCopyText\(/.test(entered) &&
    /omniboxNoteRoute\(noteId, bodyId\)/.test(entered),
  'background.ts chưa theo section')
const app = read('src', 'pages', 'App.vue')
check('F4.8 App.vue: ?section= → notes.selectNote(noteId, sectionId)',
  /route\.query\.section/.test(app) && /notes\.selectNote\(noteId, sectionId\)/.test(app), 'App.vue')

const en = read('src', 'i18n', 'en.ts')
const vi = read('src', 'i18n', 'vi.ts')
const readme = read('README.md')
const featureRow = readme.split('\n').find((l) => l.startsWith('| **Address bar search** |')) ?? ''
const shortcutRow = readme.split('\n').find((l) => l.startsWith('| `bbq` + `Space`')) ?? ''
const desc = read('docs', 'chrome-store-detailed-description.txt')
const descLine = desc.split('\n').find((l) => l.startsWith('Search from the address bar')) ?? ''
const listingLine = read('docs', 'CHROME-STORE-LISTING.md').split('\n').find((l) => l.startsWith('- **Address bar search:**')) ?? ''
check('F4.9 i18n + README + mô tả Store + listing: mỗi section một gợi ý, Alt+Enter chép section đó (hết "copies the whole note")',
  /'omnibox\.default': '[^']*Alt\+Enter copies the section/.test(en) && /'omnibox\.default': '[^']*Alt\+Enter sao chép phần nội dung/.test(vi) &&
    [featureRow, shortcutRow, descLine, listingLine].every((l) => /section/i.test(l) && !/whole note/i.test(l)),
  JSON.stringify([featureRow.slice(0, 80), shortcutRow.slice(0, 80), descLine.slice(0, 80), listingLine.slice(0, 80)]))

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/F4-omnibox-sections.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. F4 đúng spec.')
