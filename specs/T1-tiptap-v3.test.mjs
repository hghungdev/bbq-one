/**
 * FAILING TEST — T1 + T2: thư viện sạch cho 2.1.2 — Tiptap 2.27.3 → 3.32.1 (SEC-1 phần 2, GHSA-cp6q-959q-f8rh) và
 * vite 5.4.21 → 6.4.5 (lỗ hổng máy chủ dev). Schema ghi chú phải GIỮ Y NHƯ 2.x (không `link`, không `underline`).
 *
 * Chạy:   node specs/T1-tiptap-v3.test.mjs
 * GREEN sau khi áp specs/T1-tiptap-v3.spec.md.
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
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports)
  return mod.exports
}
const gte = (a, b) => {
  const pa = String(a).split(/[.-]/).map(Number)
  const pb = String(b).split(/[.-]/).map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  return true
}
/** Đọc mọi file .ts / .vue trong src/ (bỏ qua node_modules). */
function srcFiles(dir = path.join(ROOT, 'src'), out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) srcFiles(p, out)
    else if (/\.(ts|vue)$/.test(e.name)) out.push([path.relative(ROOT, p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8')])
  }
  return out
}

const pkg = JSON.parse(read('package.json') || '{}')
const lock = JSON.parse(read('package-lock.json') || '{}').packages ?? {}
const lockVer = (n) => lock[`node_modules/${n}`]?.version ?? '0.0.0'

// ── T1.1 gói ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('T1 — Tiptap 3 (package.json + lock)')
const TIPTAP = ['@tiptap/core', '@tiptap/pm', '@tiptap/starter-kit', '@tiptap/vue-3']
const declared = TIPTAP.map((n) => [n, pkg.dependencies?.[n] ?? '(thiếu)'])
const tiptapLock = Object.entries(lock)
  .filter(([k]) => /^node_modules\/@tiptap\/[^/]+$/.test(k))
  .map(([k, x]) => [k.slice('node_modules/'.length), x.version])
const tiptapVers = [...new Set(tiptapLock.map(([, v]) => v))]
check('T1.1 package.json khai @tiptap/core, pm, starter-kit, vue-3 = ^3.32.1; mọi @tiptap/* trong lock cùng một bản ≥ 3.32.1',
  declared.every(([, r]) => r === '^3.32.1') && tiptapVers.length === 1 && gte(tiptapVers[0], '3.32.1'),
  `${declared.map(([n, r]) => `${n}@${r}`).join(', ')} · lock: ${tiptapVers.join(', ') || '(không có)'}`)

// ── T1.2 schema thật ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT1 — schema ghi chú giữ y như 2.x')
const NODES = ['blockquote', 'bulletList', 'codeBlock', 'doc', 'hardBreak', 'heading', 'horizontalRule', 'listItem', 'orderedList', 'paragraph', 'text']
const MARKS = ['bold', 'code', 'italic', 'strike']
let schema = null
let schemaErr = ''
try {
  const core = require('@tiptap/core')
  const ext = load('src/utils/noteEditorExtensions.ts', { '@tiptap/starter-kit': require('@tiptap/starter-kit') })
  schema = core.getSchema(ext.noteEditorExtensions())
} catch (e) {
  schemaErr = e.message
}
const nodes = schema ? Object.keys(schema.nodes).sort() : []
const marks = schema ? Object.keys(schema.marks).sort() : []
check('T1.2 getSchema(noteEditorExtensions()): nodes / marks ĐÚNG BẰNG 2.x (không link, không underline)',
  schema && JSON.stringify(nodes) === JSON.stringify([...NODES].sort()) && JSON.stringify(marks) === JSON.stringify([...MARKS].sort()),
  schemaErr || `nodes=${nodes.join(',')} marks=${marks.join(',')}`)

// ── T1.3 / T1.4 mã nguồn ───────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT1 — API Tiptap 3 trong src/')
const files = srcFiles()
const oldSetContent = files.filter(([, s]) => /\.(setContent|clearContent)\([^)]*,\s*(false|true)\s*\)|\.clearContent\(\s*(false|true)\s*\)/.test(s)).map(([f]) => f)
const editor = read('src', 'components', 'notes', 'NoteEditor.vue')
const emitFalse = (editor.match(/setContent\([^)]*\{\s*emitUpdate:\s*false\s*\}\s*\)/g) || []).length
check('T1.3 không còn setContent(…, false) / clearContent(false); NoteEditor gọi setContent(…, { emitUpdate: false }) ở cả 2 chỗ',
  oldSetContent.length === 0 && emitFalse >= 2,
  `cũ: ${oldSetContent.join(', ') || '—'} · emitUpdate:false = ${emitFalse}`)
const ghost = files.filter(([, s]) => /from\s+['"]prosemirror-/.test(s)).map(([f]) => f)
check("T1.4 không import thẳng 'prosemirror-*' (gói không khai) — dùng '@tiptap/pm/*' (cùng bản với Tiptap)",
  ghost.length === 0 && /from '@tiptap\/pm\/model'/.test(read('src', 'utils', 'pastePlainText.ts')) &&
    /from '@tiptap\/pm\/view'/.test(read('src', 'utils', 'pastePlainText.ts')) && /from '@tiptap\/pm\/view'/.test(editor),
  ghost.join(', ') || 'chưa đổi sang @tiptap/pm/*')

// ── T1.5 bộ lọc B1 dùng chung schema: không quy tắc nào nhận thẻ nguy hiểm ───────────────────────────────────────────
const RISKY = /^(a|u|img|iframe|script|style|object|embed|form|input|svg|video|audio|source|link|meta|base)\b/i
const rules = []
if (schema) {
  for (const t of [...Object.values(schema.nodes), ...Object.values(schema.marks)]) {
    for (const r of t.spec.parseDOM || []) if (r.tag) rules.push([t.name, r.tag])
  }
}
// (Gạch chân theo style `text-decoration` không so được ở đây — strike dùng chung style đó; T1.2 đã chặn mark `underline`.)
const risky = rules.filter(([, tag]) => RISKY.test(tag))
check('T1.5 không parseDOM nào nhận <a> / <u> / <img> / <iframe> / <script>… → sanitizeNoteHtml (B1) bỏ chúng, giữ chữ',
  schema && rules.length > 0 && risky.length === 0,
  schemaErr || risky.map(([n, t]) => `${n}:${t}`).join(', '))

// ── T1.6 vite (T2) ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT2 — vite 6 (máy chủ dev)')
const viteRange = pkg.devDependencies?.vite ?? '(thiếu)'
check('T1.6 vite ^6.4.5 (lock ≥ 6.4.4, < 7), esbuild trong lock ≥ 0.25.0',
  viteRange === '^6.4.5' && gte(lockVer('vite'), '6.4.4') && !gte(lockVer('vite'), '7.0.0') && gte(lockVer('esbuild'), '0.25.0'),
  `package.json vite=${viteRange} · lock vite=${lockVer('vite')} esbuild=${lockVer('esbuild')}`)
// T1.7: vite.config.ts import 'node:url' + import.meta.url → cần kiểu Node. Trước đây @types/node chỉ có nhờ cài kèm
// (supabase-js → realtime-js → @types/ws); supabase-js 2.118 bỏ @types/ws → vue-tsc -b gãy (PR Dependabot #4).
check('T1.7 devDependencies khai thẳng @types/node (không dựa vào gói cài kèm)',
  /^\^?\d+/.test(pkg.devDependencies?.['@types/node'] ?? '') && !!lock['node_modules/@types/node'],
  `package.json @types/node=${pkg.devDependencies?.['@types/node'] ?? '(thiếu)'}`)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/T1-tiptap-v3.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. T1 đúng spec.')
