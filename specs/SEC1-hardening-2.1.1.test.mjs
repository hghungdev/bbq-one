/**
 * FAILING TEST — SEC1: bản vá bảo mật 2.1.1 — thư viện, HREF xuất HTML, ký tự điều khiển (ICS + nạp file), lọc link khi
 * khôi phục bookmark, đọc HTML trên tài liệu trơ, siết CSP.
 *
 * Chạy:   node specs/SEC1-hardening-2.1.1.test.mjs
 * GREEN sau khi áp specs/SEC1-hardening-2.1.1.spec.md.
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
  const req = (s) => {
    if (s in mocks) return mocks[s]
    throw new Error(`Unmocked import in ${path.basename(rel)}: ${s}`)
  }
  const names = Object.keys(globals)
  new Function('require', 'module', 'exports', ...names, js)(req, mod, mod.exports, ...names.map((n) => globals[n]))
  return mod.exports
}
const tryLoad = (rel, mocks, globals) => {
  try {
    return load(rel, mocks, globals)
  } catch (e) {
    return { __error: e.message }
  }
}

// ── T1 thư viện ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('T1 — thư viện đã vá (package-lock)')
const lock = JSON.parse(read('package-lock.json') || '{}').packages ?? {}
const ver = (n) => lock[`node_modules/${n}`]?.version ?? '0.0.0'
const gte = (a, b) => {
  const pa = a.split(/[.-]/).map(Number)
  const pb = b.split(/[.-]/).map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  return true
}
const MIN = {
  'prosemirror-view': '1.42.3', vue: '3.5.42', '@vue/server-renderer': '3.5.42', 'markdown-it': '14.3.3',
  'linkify-it': '5.0.2', nanoid: '3.3.18', postcss: '8.5.23', ws: '8.20.2', 'source-map-js': '1.2.2',
}
// (đổi có chủ đích — T1, 2.1.2) Tiptap 3 bỏ markdown-it / linkify-it: gói không còn trong lock = đạt; còn thì phải ≥ bản vá.
const GONE_OK = new Set(['markdown-it', 'linkify-it'])
const low = Object.entries(MIN)
  .filter(([n, m]) => !(GONE_OK.has(n) && !lock[`node_modules/${n}`]) && !gte(ver(n), m))
  .map(([n, m]) => `${n}@${ver(n)} < ${m}`)
check('SEC1.1 bản đã vá: prosemirror-view ≥ 1.42.3 (XSS khi dán), vue ≥ 3.5.42, markdown-it, linkify-it, postcss, ws, nanoid, source-map-js', low.length === 0, low.join(', '))
const tiptap = Object.entries(lock).filter(([k]) => k.startsWith('node_modules/@tiptap/')).map(([, x]) => x.version)
check('SEC1.2 mọi gói Tiptap cùng một bản (không lệch sau khi vá)', tiptap.length > 0 && new Set(tiptap).size === 1, [...new Set(tiptap)].join(', '))

// ── T2 xuất HTML ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT2 — xuất bookmark HTML escape HREF; khôi phục bookmark lọc link')
const SAFE = tryLoad('src/utils/safeUrl.ts')
let lastBlob = null
const created = []
const chromeMock = {
  downloads: { download: (opts) => { void opts } },
  bookmarks: {
    getTree: async () => [{ id: '0', title: '', children: [{ id: '1', title: 'Bar', children: [] }, { id: '2', title: 'Other', children: [] }] }],
    getChildren: async () => [],
    removeTree: async () => {},
    create: async (o) => { created.push(o); return { id: `n${created.length}`, ...o } },
  },
}
const svc = SAFE.__error
  ? SAFE
  : tryLoad('src/services/bookmarks.service.ts', {
      './supabase': { supabase: {} },
      '@/utils/bookmarkFingerprint': { hashBookmarkTree: async () => 'h', setPersistedBookmarkTreeHash: async () => {} },
      '@/utils/bookmarkTree': { unwrapBookmarkRoot: (nodes) => nodes },
      '@/services/localFirst/authMode': { isAuthenticated: async () => false },
      '@/services/localFirst/localBookmarks.service': { localBookmarksService: {} },
      '@/utils/safeUrl': SAFE,
    }, { chrome: chromeMock, URL: { createObjectURL: (b) => { lastBlob = b; return 'blob:x' }, revokeObjectURL: () => {} } })
const tree = [{ id: '0', title: '', children: [{ id: '1', title: 'Bar', children: [
  { id: '3', title: 'Ok', url: 'https://ok.example/?a=1&b="2"' },
  { id: '4', title: 'Evil', url: 'javascript:alert("x")"><script>alert(1)</script>' },
  { id: '5', title: 'Data', url: '  DATA:text/html,<b>x</b>' },
  { id: '6', title: 'Folder', children: [{ id: '7', title: 'In', url: 'http://in.example' }, { id: '8', title: 'Js', url: 'JavaScript:void(0)' }] },
] }] }]
if (svc.__error) {
  check('SEC1.3 bookmarks.service + utils/safeUrl load được', false, svc.__error)
} else {
  svc.bookmarksService.exportAsHTML(tree)
  const html = lastBlob ? await lastBlob.text() : ''
  check(
    'SEC1.3 exportAsHTML: HREF qua escHtml — link có " không thoát được khỏi thuộc tính',
    html.includes('HREF="https://ok.example/?a=1&amp;b=&quot;2&quot;"') && !html.includes('"><script>') && html.includes('&lt;script&gt;'),
    html.split('\n').filter((l) => l.includes('HREF')).join(' | '),
  )
  const r = await svc.bookmarksService.restoreToChrome(tree)
  const urls = created.map((c) => c.url).filter(Boolean)
  check(
    'SEC1.4 restoreToChrome: chỉ tạo link http(s)/ftp/file (bỏ javascript:/data: kể cả hoa thường, khoảng trắng đầu), giữ thư mục; trả số bị bỏ',
    urls.join() === 'https://ok.example/?a=1&b="2",http://in.example' && created.some((c) => c.title === 'Folder' && !c.url) && r?.skipped === 3,
    `${JSON.stringify(urls)} skipped=${r?.skipped}`,
  )
}
if (!SAFE.__error) {
  check(
    'SEC1.5 utils/safeUrl: isSafeBookmarkUrl / filterUnsafeBookmarks (không sửa cây gốc) / countUnsafeBookmarks',
    SAFE.isSafeBookmarkUrl('https://a') && SAFE.isSafeBookmarkUrl('FILE:///x') && !SAFE.isSafeBookmarkUrl(' javascript:1') &&
      !SAFE.isSafeBookmarkUrl('vbscript:x') && !SAFE.isSafeBookmarkUrl('chrome://settings') &&
      SAFE.countUnsafeBookmarks(tree) === 3 && SAFE.filterUnsafeBookmarks(tree).skipped === 3 &&
      tree[0].children[0].children.length === 4,
    String(SAFE.countUnsafeBookmarks?.(tree)),
  )
}
const tab = read('src', 'components', 'bookmarks', 'BookmarkTab.vue')
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
check(
  'SEC1.6 hộp xác nhận Khôi phục báo trước số bookmark javascript:/data: sẽ bị bỏ (bookmark.restoreUnsafe)',
  /countUnsafeBookmarks\(/.test(tab) && /bookmark\.restoreUnsafe/.test(tab) && /'bookmark\.restoreUnsafe': '[^']*\{n\}/.test(vi) && /'bookmark\.restoreUnsafe': '[^']*\{n\}/.test(en),
  'chưa báo',
)

// ── T3 ICS + ký tự điều khiển ───────────────────────────────────────────────────────────────────────────────────────
console.log('\nT3 — ký tự điều khiển: ICS (Google Calendar) + nạp file')
const ICS = tryLoad('supabase/functions/calendar-feed/ics.ts')
const now = new Date('2026-10-29T03:00:00Z')
const ics = ICS.__error ? '' : ICS.buildIcs([{
  id: 'e1', title: 'Họp\rURL:https://phish.example\r\nX-INJ:1\u0000', description: 'dòng 1\rdòng 2\u0007\u001b[31m',
  event_date: '2026-10-30', start_time: null, end_time: null, is_done: false, updated_at: null,
}], { now })
const lines = ics.split('\r\n')
check(
  'SEC1.7 ICS: \\r / \\r\\n / ký tự điều khiển trong tên + mô tả KHÔNG tạo được dòng / thuộc tính mới (URL:, X-INJ)',
  ics !== '' && !lines.some((l) => /^(URL|X-INJ|BEGIN:VALARM)/.test(l)) && !/\r(?!\n)/.test(ics) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(ics) &&
    lines.some((l) => l.startsWith('SUMMARY:Họp\\nURL:https://phish.example\\nX-INJ:1')) && lines.some((l) => l.startsWith('DESCRIPTION:dòng 1\\ndòng 2[31m')),
  JSON.stringify(lines.filter((l) => /SUMMARY|DESCRIPTION|URL|X-INJ/.test(l))),
)
const CC = tryLoad('src/utils/controlChars.ts')
check(
  'SEC1.8 stripControlChars: một dòng → điều khiển thành khoảng trắng; nhiều dòng → giữ \\n + \\t, \\r\\n / \\r → \\n',
  !CC.__error && CC.stripControlChars('a\rb\nc\u0000d') === 'a b c d' && CC.stripControlChars('x\r\ny\rz\tw\u0007', true) === 'x\ny\nz\tw',
  CC.__error ?? JSON.stringify([CC.stripControlChars?.('a\rb\nc\u0000d'), CC.stripControlChars?.('x\r\ny\rz\tw\u0007', true)]),
)
const CAL = load('src/constants/calendar.ts')
const STORAGE = load('src/constants/storage.ts')
const LOCAL = load('src/types/localFirst.ts')
const BF = tryLoad('src/utils/backupFile.ts', {
  '@/constants/calendar': CAL, '@/constants/storage': STORAGE, '@/types/localFirst': LOCAL,
  '@/utils/secureCrypto': load('src/utils/secureCrypto.ts'), '@/utils/controlChars': CC.__error ? {} : CC, '@/utils/safeUrl': SAFE.__error ? {} : SAFE,
})
const T = '2026-10-29T03:15:00.000Z'
const U = (s) => `00000000-0000-4000-8000-${Buffer.from(String(s)).toString('hex').padStart(12, '0').slice(-12)}`
const pr = BF.__error ? null : BF.parseBackup(JSON.stringify({ app: 'bbqone', format: 1, data: {
  folders: [{ id: U('f'), name: 'Work\r\nX', position: 0, created_at: T, updated_at: T, is_secure: false, secure_salt: null, pbkdf2_iterations: 310000, secure_verifier_enc: null }],
  notes: [{ id: U('n'), folder_id: U('f'), title: 'T\u0000itle\r', tags: [], created_at: T, updated_at: T }],
  note_bodies: [],
  calendar_events: [{ id: U('e'), event_date: '2026-10-30', title: 'Họp\rURL:x', description: 'a\r\nb\u0000', is_done: false, position: 0, color: null, start_time: null, end_time: null, created_at: T, updated_at: T }],
  bookmark_backups: [{ id: U('k'), label: 'b\rk', browser_hint: 'chrome', created_at: T, tree_json: [{ id: '0', title: 'R\u0000oot', children: [] }] }],
} }), (h) => h)
const dd = pr?.file?.data
check(
  'SEC1.9 nạp file (B1): tên thư mục / ghi chú / sự kiện / bản bookmark / nút bookmark bỏ ký tự điều khiển; mô tả giữ xuống dòng',
  !!dd && dd.folders[0].name === 'Work  X' && dd.notes[0].title === 'T itle ' && dd.calendar_events[0].title === 'Họp URL:x' &&
    dd.calendar_events[0].description === 'a\nb' && dd.bookmark_backups[0].label === 'b k' && dd.bookmark_backups[0].tree_json[0].title === 'R oot',
  BF.__error ?? JSON.stringify([dd?.folders?.[0]?.name, dd?.notes?.[0]?.title, dd?.calendar_events?.[0]?.title, dd?.calendar_events?.[0]?.description]),
)
check('SEC1.10 B1 dùng chung isSafeBookmarkUrl (utils/safeUrl) — một danh sách trắng', /isSafeBookmarkUrl\(/.test(read('src', 'utils', 'backupFile.ts')) && !/const SAFE_URL/.test(read('src', 'utils', 'backupFile.ts')), 'còn bản riêng')

// ── T4 HTML trên tài liệu trơ ───────────────────────────────────────────────────────────────────────────────────────
console.log('\nT4 — đọc HTML trên tài liệu trơ (ảnh không tự tải)')
let liveCreates = 0
let inertCreates = 0
const fakeEl = () => {
  let html = ''
  return { set innerHTML(v) { html = v }, get textContent() { return html.replace(/<[^>]*>/g, '') }, get innerText() { return html.replace(/<[^>]*>/g, '') } }
}
const fakeDoc = {
  createElement: () => { liveCreates++; return fakeEl() },
  implementation: { createHTMLDocument: () => ({ createElement: () => { inertCreates++; return fakeEl() } }) },
}
const TX = tryLoad('src/utils/text.ts', {}, { document: fakeDoc })
if (TX.__error) {
  check('SEC1.11 text.ts load được', false, TX.__error)
} else {
  const a = TX.plainTextFromHtml('<p>x</p><img src="https://evil.example/p.png">')
  const b = TX.htmlToClipboardPlain('<p>y</p>')
  check(
    'SEC1.11 plainTextFromHtml / htmlToClipboardPlain dựng phần tử trong tài liệu TRƠ (createHTMLDocument), không trong document đang mở',
    a === 'x' && b === 'y' && liveCreates === 0 && inertCreates >= 2 && typeof TX.inertElement === 'function',
    `live=${liveCreates} inert=${inertCreates} a=${a}`,
  )
}
const paste = read('src', 'utils', 'pastePlainText.ts')
check(
  'SEC1.12 pastePlainText: sanitizeHtmlToNoteContent + insertHtmlIntoEditor dùng inertElement (không document.createElement + innerHTML)',
  (paste.match(/inertElement\(/g) ?? []).length >= 2 && !/document\.createElement\('div'\)/.test(paste),
  'còn tạo phần tử trong document đang mở',
)

// ── T5 CSP ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT5 — CSP')
const manifest = JSON.parse(read('public', 'manifest.json') || '{}')
const csp = manifest.content_security_policy?.extension_pages ?? ''
const dir = Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v.join(' ')] }))
check(
  "SEC1.13 CSP: default-src 'self'; img-src 'self' data:; frame-src / object-src 'none'; base-uri / form-action 'none'; giữ script (WASM), style, font, Supabase",
  dir['default-src'] === "'self'" && dir['img-src'] === "'self' data:" && dir['frame-src'] === "'none'" && dir['object-src'] === "'none'" &&
    dir['base-uri'] === "'none'" && dir['form-action'] === "'none'" && dir['script-src'] === "'self' 'wasm-unsafe-eval'" &&
    dir['style-src'] === "'self' 'unsafe-inline'" && dir['font-src'] === "'self' data:" && dir['connect-src'] === "'self' https://*.supabase.co",
  csp,
)

// ── T6 phát hành 2.1.1 ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT6 — phát hành 2.1.1')
const V = '2.1.1'
const pkg = JSON.parse(read('package.json') || '{}')
const lockRoot = JSON.parse(read('package-lock.json') || '{}')
check('SEC1.14 manifest / package.json / lock = 2.1.1; quyền không đổi',
  manifest.version === V && pkg.version === V && lockRoot.version === V && lockRoot.packages?.['']?.version === V &&
    JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'clipboardWrite', 'offscreen', 'bookmarks', 'downloads']),
  `${manifest.version}/${pkg.version}/${lockRoot.version}`)
const readme = read('README.md')
const sec = readme.slice(readme.indexOf('## What changed in 2.1.1'), readme.indexOf('## What changed in 2.1.0'))
check('SEC1.15 README: Version 2.1.1 + "What changed in 2.1.1" (mục lục, trước 2.1.0) nói vá thư viện / CSP / bookmark / ICS',
  readme.includes(`**Version:** ${V}`) && /\[What changed in 2\.1\.1\]\(#what-changed-in-211\)/.test(readme) && sec.length > 0 &&
    /prosemirror/i.test(sec) && /CSP|Content Security Policy/.test(sec) && /javascript:/.test(sec) && /calendar/i.test(sec),
  'README')
const txt = read('docs', 'chrome-store-detailed-description.txt')
check("SEC1.16 Store: WHAT'S NEW IN 2.1.1 (gồm sao lưu ra file của 2.1.0 + bảo mật), Release 2.1.1 (highlights); permissions doc **v2.1.1**; DESIGN 2.1.1",
  /WHAT'S NEW IN 2\.1\.1/.test(txt) && /Backup files|backup/i.test(txt.slice(txt.indexOf("WHAT'S NEW"), txt.indexOf("WHAT'S NEW") + 1200)) &&
    /Security/i.test(txt.slice(txt.indexOf("WHAT'S NEW"), txt.indexOf("WHAT'S NEW") + 1200)) &&
    /Release 2\.1\.1 \(highlights\)/.test(read('docs', 'CHROME-STORE-LISTING.md')) && read('docs', 'CHROME-STORE-PERMISSIONS.md').includes('**v2.1.1**') &&
    /\nversion: 2\.1\.1\n/.test(read('DESIGN.md')),
  'docs')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/SEC1-hardening-2.1.1.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. SEC1 đúng spec.')
