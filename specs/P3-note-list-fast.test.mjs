/**
 * FAILING TEST — P3: danh sách ghi chú nhanh — chỉ mục body theo ghi chú, plain text nhớ theo body, vẽ dần.
 *
 * Chạy:   node specs/P3-note-list-fast.test.mjs
 * GREEN sau khi áp specs/P3-note-list-fast.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')
const vue = require('vue')

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
/** Nạp module TS THẬT: `mocks` cho import, `globals` cho biến toàn cục (document, IntersectionObserver…). */
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

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — utils/noteBodyIndex.ts: chỉ mục body theo ghi chú (CODE THẬT)')
let IX = null
try {
  IX = load('src/utils/noteBodyIndex.ts')
} catch (e) {
  check('T1.0 src/utils/noteBodyIndex.ts tồn tại + export indexBodiesByNote', false, e.message)
}
const oldBodiesForNote = (all, id) => all.filter((b) => b.note_id === id).slice().sort((a, b) => a.position - b.position)
if (IX?.indexBodiesByNote) {
  // 2.000 ghi chú × 1–3 body, thứ tự trộn, có position trùng (kiểm sắp xếp ổn định).
  let seed = 7
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n)
  const bodies = []
  for (let i = 0; i < 2000; i++) {
    for (let b = 0, k = 1 + rnd(3); b < k; b++) bodies.push({ id: `b${i}_${b}`, note_id: `n${i}`, position: rnd(2), content: `<p>${i}-${b}</p>` })
  }
  for (let i = bodies.length - 1; i > 0; i--) {
    const j = rnd(i + 1)
    ;[bodies[i], bodies[j]] = [bodies[j], bodies[i]]
  }
  const t0 = performance.now()
  const idx = IX.indexBodiesByNote(bodies)
  const ms = performance.now() - t0
  const wrong = []
  for (let i = 0; i < 2000; i++) {
    const want = oldBodiesForNote(bodies, `n${i}`)
    const got = idx.get(`n${i}`) ?? []
    if (want.length !== got.length || want.some((b, k) => b !== got[k])) wrong.push(`n${i}`)
  }
  check('T1.1 mỗi ghi chú: đúng các body, đúng thứ tự cũ (position, ổn định) — 2.000 ghi chú', wrong.length === 0, `${wrong.length} ghi chú sai, vd ${wrong.slice(0, 3)}`)
  check('T1.2 một lượt cho cả kho (4.000 body < 50 ms)', ms < 50, `${ms.toFixed(1)} ms`)

  const at = bodies.findIndex((b) => b.note_id === 'n5')
  const next = bodies.slice()
  next[at] = { ...bodies[at], content: '<p>đã sửa</p>' }
  const idx2 = IX.indexBodiesByNote(next, idx)
  check(
    'T1.3 có prev: nhóm không đổi dùng lại ĐÚNG mảng cũ; nhóm có body mới → mảng mới chứa body mới',
    idx2.get('n6') === idx.get('n6') && idx2.get('n1999') === idx.get('n1999') && idx2.get('n5') !== idx.get('n5') &&
      idx2.get('n5').includes(next[at]),
    'không dùng lại / không cập nhật đúng',
  )
  const dropped = next.filter((b) => b.note_id !== 'n7')
  const idx3 = IX.indexBodiesByNote(dropped, idx2)
  const moved = dropped.map((b) => (b.note_id === 'n8' && b.position === 0 ? { ...b, position: 9 } : b))
  const idx4 = IX.indexBodiesByNote(moved, idx3)
  check(
    'T1.4 ghi chú hết body → không còn trong chỉ mục; đổi position → nhóm sắp lại',
    !idx3.has('n7') && JSON.stringify((idx4.get('n8') ?? []).map((b) => b.id)) === JSON.stringify(oldBodiesForNote(moved, 'n8').map((b) => b.id)),
    'sai',
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — utils/text.ts: plain text nhớ theo body (CODE THẬT, document giả đếm số lần dựng DOM)')
let parses = 0
const fakeDocument = {
  createElement: () => {
    parses++
    let html = ''
    return {
      set innerHTML(v) { html = v },
      get textContent() { return html.replace(/<[^>]*>/g, '') },
    }
  },
}
let TX = null
try {
  TX = load('src/utils/text.ts', {}, { document: fakeDocument })
} catch (e) {
  check('T2.0 text.ts load được', false, e.message)
}
if (TX) {
  check('T2.1 export bodyPlainText', typeof TX.bodyPlainText === 'function', 'chưa có bodyPlainText')
  if (typeof TX.bodyPlainText === 'function') {
    const b = { content: '<p>Xin chào</p><p>bạn</p>', position: 0 }
    parses = 0
    const a1 = TX.bodyPlainText(b)
    const a2 = TX.bodyPlainText(b)
    const p1 = parses
    b.content = '<p>Đã đổi</p>'
    const a3 = TX.bodyPlainText(b)
    check(
      'T2.2 cùng body + cùng content → dựng DOM 1 lần; content đổi → tính lại đúng',
      a1 === 'Xin chào bạn' && a2 === a1 && p1 === 1 && a3 === 'Đã đổi' && parses === 2,
      `a1=${a1} a3=${a3} parses=${parses}`,
    )
    const note = { title: '', tags: [] }
    const bs = [{ content: '<p>Dòng đầu</p>', position: 1 }, { content: '<p>Trước nhất</p>', position: 0 }]
    parses = 0
    const l1 = TX.noteListLabel(note, bs, 'UNTITLED')
    const s1 = TX.searchBodySnippetPlain(bs, 'đầu')
    const p2 = parses
    for (let i = 0; i < 50; i++) {
      TX.noteListLabel(note, bs, 'UNTITLED')
      TX.searchBodySnippetPlain(bs, 'đầu')
    }
    check(
      'T2.3 noteListLabel + searchBodySnippetPlain dùng bodyPlainText: gọi lại 50 lần không dựng DOM thêm',
      l1 === 'Trước nhất' && /Dòng đầu/.test(s1) && p2 <= 2 && parses === p2,
      `label=${l1} snippet=${s1} parses ${p2} → ${parses}`,
    )
  }
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — composables/useProgressiveList.ts: vẽ dần (CODE THẬT + Vue thật, IntersectionObserver giả)')
const observers = []
class FakeIO {
  constructor(cb, opts) {
    this.cb = cb
    this.opts = opts
    this.observed = []
    this.observeCalls = 0
    this.disconnected = false
    observers.push(this)
  }
  observe(el) { this.observed.push(el); this.observeCalls++ }
  unobserve(el) { this.observed = this.observed.filter((x) => x !== el) }
  disconnect() { this.disconnected = true; this.observed = [] }
  fire(isIntersecting) { this.cb([{ isIntersecting, target: this.observed[0] }], this) }
}
let PL = null
try {
  PL = load('src/composables/useProgressiveList.ts', { vue }, { IntersectionObserver: FakeIO })
} catch (e) {
  check('T3.0 src/composables/useProgressiveList.ts tồn tại', false, e.message)
}
if (PL?.useProgressiveList) {
  const { ref, effectScope, nextTick } = vue
  const items = ref(Array.from({ length: 600 }, (_, i) => ({ id: `n${i}` })))
  const key = ref('f1')
  const active = ref(-1)
  const scope = effectScope()
  const P = scope.run(() =>
    PL.useProgressiveList(() => items.value, { resetKey: () => key.value, mustShowIndex: () => active.value }),
  )
  check('T3.1 mặc định vẽ 60 / 600, còn dòng', P.visible.value.length === 60 && P.hasMore.value === true, `${P.visible.value.length}`)

  const scroller = { tag: 'note-list__body' }
  const el = { parentElement: scroller }
  P.sentinel.value = el
  await nextTick()
  await nextTick()
  const io = observers.at(-1)
  check('T3.2 gắn sentinel → IntersectionObserver root = khung cuộn, quan sát sentinel', !!io && io.opts?.root === scroller && io.observed.includes(el), io ? JSON.stringify(io.opts) : 'không tạo observer')
  if (io) {
    const before = io.observeCalls
    io.fire(false)
    const still = P.visible.value.length
    io.fire(true)
    await nextTick()
    await nextTick()
    check('T3.3 sentinel lọt khung → vẽ thêm 60 (120); không lọt → giữ nguyên', still === 60 && P.visible.value.length === 120, `${still} → ${P.visible.value.length}`)
    check('T3.4 sau khi vẽ thêm → quan sát lại sentinel (danh sách vẫn ngắn thì tiếp tục nạp)', io.observeCalls > before || observers.at(-1) !== io, `observe ${before} → ${io.observeCalls}`)
  }
  key.value = 'f2'
  await nextTick()
  check('T3.5 đổi thư mục / tìm / thẻ (resetKey) → về 60', P.visible.value.length === 60, `${P.visible.value.length}`)
  active.value = 250
  await nextTick()
  check('T3.6 dòng phải hiện ở vị trí 250 → vẽ tới trang chứa nó (300)', P.visible.value.length === 300, `${P.visible.value.length}`)
  items.value = items.value.slice(0, 30)
  await nextTick()
  check('T3.7 danh sách còn 30 → vẽ đủ 30, hết dòng chờ', P.visible.value.length === 30 && P.hasMore.value === false, `${P.visible.value.length}`)
  scope.stop()
  check('T3.8 hủy scope → ngắt observer', observers.every((o) => o.disconnected || o.observed.length === 0), 'observer còn sống')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — nối dây (tĩnh)')
const store = read('src', 'stores', 'notes.ts')
const fnBodies = store.match(/function bodiesForNote\([^)]*\)[^{]*{([\s\S]*?)\n  }/)?.[1] ?? ''
check(
  'T4.1 store: bodiesByNote = computed((prev) => indexBodiesByNote(bodies.value, prev)), export; bodiesForNote đọc chỉ mục + .slice()',
  /import { indexBodiesByNote } from '@\/utils\/noteBodyIndex'/.test(store) &&
    /const bodiesByNote = computed\(\s*\(prev[^)]*\)\s*=>\s*indexBodiesByNote\(bodies\.value, prev\)/.test(store) &&
    /\n    bodiesByNote,\n/.test(store) &&
    /bodiesByNote\.value\.get\(noteId\)/.test(fnBodies) && /\.slice\(\)/.test(fnBodies) && !/\.filter\(/.test(fnBodies),
  'store chưa có / chưa dùng chỉ mục',
)
const item = read('src', 'components', 'notes', 'NoteItem.vue')
check(
  'T4.2 NoteItem: bodies từ notes.bodiesByNote.get(...) (mảng dùng chung), không gọi bodiesForNote',
  /notes\.bodiesByNote\.get\(props\.note\.id\)/.test(item) && !/notes\.bodiesForNote\(/.test(item),
  'NoteItem vẫn quét kho',
)
const list = read('src', 'components', 'layout', 'NoteList.vue')
check(
  'T4.3 NoteList: useProgressiveList (reset theo thư mục + ô tìm + thẻ; giữ dòng đang chọn), v-for trên visible, sentinel',
  /useProgressiveList\(/.test(list) && /activeFolderId/.test(list.match(/resetKey:[^\n]*/)?.[0] ?? '') &&
    /searchQuery/.test(list.match(/resetKey:[^\n]*/)?.[0] ?? '') && /filterTag/.test(list.match(/resetKey:[^\n]*/)?.[0] ?? '') &&
    /mustShowIndex:[^\n]*activeNoteId/.test(list) && /v-for="n in visible"/.test(list) && /ref="sentinel"/.test(list) &&
    /v-if="hasMore"/.test(list),
  'NoteList chưa vẽ dần',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/P3-note-list-fast.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. P3 đúng spec.')
