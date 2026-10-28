/**
 * FAILING TEST — U15: ngôn ngữ icon thống nhất (một bộ icon, một nghĩa cho mỗi icon).
 *
 * Chạy:   node specs/U15-icon-language.test.mjs
 *
 * T — code thật components/ui/icons.ts.
 * S — quét mọi .vue: nguồn icon duy nhất, nút icon có aria-label + tooltip, hết nhãn "[ X ]".
 * GREEN sau khi áp specs/U15-icon-language.spec.md.
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
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p))
const template = (src) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'))

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const SRC = path.join(ROOT, 'src')
const vueFiles = walk(SRC).filter((f) => f.endsWith('.vue'))
const rel = (f) => path.relative(ROOT, f)

/** Thẻ mở `<tag ...>` — dừng ở `>` ngoài dấu ngoặc kép (handler có `=>` không làm cắt sớm). */
function openTags(src, tag) {
  const out = []
  let i = src.indexOf(`<${tag}`)
  while (i !== -1) {
    const next = src[i + tag.length + 1]
    if (next === ' ' || next === '\n' || next === '>' || next === '\r') {
      let q = false
      let j = i + 1
      for (; j < src.length; j++) {
        if (src[j] === '"') q = !q
        else if (src[j] === '>' && !q) break
      }
      out.push(src.slice(i, j + 1))
    }
    i = src.indexOf(`<${tag}`, i + 1)
  }
  return out
}

function loadTsModule(filePath) {
  const js = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)(() => ({}), mod, mod.exports)
  return mod.exports
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('T — bộ icon (CODE THẬT)')

const NAMES = [
  'trash', 'close', 'plus', 'pencil', 'move', 'copy', 'restore', 'download', 'refresh', 'upload-cloud',
  // U17 (đổi có chủ đích): 'log-in' → 'user' (⇤ trông như ⇥ Đăng xuất).
  'lock', 'unlock', 'key', 'shield', 'check', 'search', 'settings', 'user', 'log-out',
  'link', 'chevron-left', 'chevron-right', 'chevron-down',
]
let icons = null
if (exists('src', 'components', 'ui', 'icons.ts')) icons = loadTsModule(path.join(SRC, 'components', 'ui', 'icons.ts'))
const set = icons?.APP_ICONS
check(
  'T1 icons.ts: APP_ICONS đủ tên, mỗi icon là danh sách path "M…"',
  !!set && NAMES.every((n) => Array.isArray(set[n]) && set[n].length > 0 && set[n].every((d) => /^M/.test(d))),
  set ? `thiếu: ${NAMES.filter((n) => !set[n]).join(', ')}` : 'chưa có icons.ts',
)
const appIcon = read('src', 'components', 'ui', 'AppIcon.vue')
check(
  'T2 AppIcon.vue vẽ từ APP_ICONS (nét 1.75, ≤ 14 px nét 2, aria-hidden)',
  /APP_ICONS/.test(appIcon) && /v-for="d in /.test(appIcon) && /1\.75/.test(appIcon) && /aria-hidden="true"/.test(appIcon),
  'chưa có AppIcon',
)
check(
  'T3 ds.css: ds-icon-action--danger (xám, đỏ khi rê)',
  /\.ds-icon-action--danger:hover/.test(read('src', 'assets', 'styles', 'ds.css')),
  'thiếu',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nS — quét mọi .vue')

const GLYPHS = {
  close: ['M6 6l12 12M18 6L6 18', 'M18 6L6 18'],
  trash: ['3 6 5 6 21 6', 'M4 7h16M9 7V5'],
  plus: ['M12 5v14M5 12h14'],
  pencil: ['M16.5 3.5a2.12'],
  'copy (đặc)': ['M16 1H4c-1.1'],
  restore: ['M9 15 3 9m0 0'],
  chevron: ['M15 6l-6 6 6 6', 'M9 6l6 6-6 6', 'M6 9l6 6 6-6'],
  settings: ['M19.4 15a1.65'],
  'log-out': ['M9 21H5a2 2'],
  'lock (header)': ['M8 10V7a4 4 0 0 1 8 0v3'],
  lock: ['M7 11V7a5 5 0 0 1 10 0v4'],
  search: ['M16 16l4.5 4.5'],
}
const dup = []
for (const f of vueFiles) {
  if (f.endsWith(path.join('ui', 'AppIcon.vue'))) continue
  const s = fs.readFileSync(f, 'utf8')
  for (const [name, frags] of Object.entries(GLYPHS)) if (frags.some((g) => s.includes(g))) dup.push(`${rel(f)}: ${name}`)
}
check('S1 nguồn icon duy nhất — không .vue nào tự vẽ lại icon hành động', dup.length === 0, `\n      ${dup.join('\n      ')}`)

const unnamed = []
for (const f of vueFiles) {
  for (const tag of openTags(fs.readFileSync(f, 'utf8'), 'button')) {
    if (!/class="[^"]*\bds-icon-action\b/.test(tag)) continue
    if (!/aria-label=/.test(tag) || !/\btitle=/.test(tag)) unnamed.push(`${rel(f)}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`)
  }
}
check('S2 mọi nút chỉ-icon có aria-label + tooltip (title)', unnamed.length === 0, `\n      ${unnamed.join('\n      ')}`)

const bracket = []
for (const f of walk(SRC).filter((x) => /\.(vue|ts)$/.test(x))) {
  const s = fs.readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\[ ?(X|OK|Y|N|DISCARD|RESTORE[^\]]*|USE [A-Z]+|CANCEL|ENCRYPTED[^\]]*|LỖI|ERROR) ?\]/g)) bracket.push(`${rel(f)}: ${m[0]}`)
}
check('S3 hết nhãn kiểu retro "[ X ]", "[ OK ]", "[ DISCARD ]", "[LỖI]"…', bracket.length === 0, `\n      ${bracket.join('\n      ')}`)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
check(
  'S4 i18n: gỡ common.bracketOk/Clear/Yes/No + confirmYnPrompt',
  !/common\.bracket|common\.confirmYnPrompt/.test(vi + en),
  'còn khóa cũ',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nM — từng màn')

const ev = template(read('src', 'components', 'calendar', 'CalendarEventModal.vue'))
check(
  'M1 Lịch: Sửa sự kiện xóa bằng 🗑 (không còn chữ "Delete"); dòng có ✎ + 🗑; ＋ là icon',
  !/\{\{\s*t\('calendar\.modal\.btn\.delete'\)\s*\}\}/.test(ev) &&
    /ds-icon-action--danger[^>]*>\s*<AppIcon name="trash"/.test(ev.replace(/\n\s*/g, ' ')) &&
    (ev.match(/name="trash"/g) ?? []).length >= 2 &&
    /name="pencil"/.test(ev) &&
    /name="plus"/.test(ev) &&
    !/ds-text-action[^>]*@click="startCreate"/.test(ev.replace(/\n\s*/g, ' ')),
  'Lịch chưa thống nhất',
)
const editor = template(read('src', 'components', 'notes', 'NoteEditor.vue'))
const tabDel = openTags(editor, 'button').find((b) => b.includes('note-editor__tab-del')) ?? ''
const afterTabDel = editor.slice(editor.indexOf(tabDel) + tabDel.length, editor.indexOf(tabDel) + tabDel.length + 120)
check(
  'M2 Ghi chú: xóa section bằng 🗑 (không phải ×); ⧉ nét; menu ⚙ + menu chuột phải thư mục dùng AppIcon',
  /name="trash"/.test(afterTabDel) &&
    /name="copy"/.test(editor) &&
    ['pencil', 'move', 'trash'].every((n) => read('src', 'components', 'ui', 'ListItemSettingsMenu.vue').includes(`name="${n}"`)) &&
    ['shield', 'unlock', 'lock', 'key'].every((n) => read('src', 'components', 'folders', 'FolderItem.vue').includes(`name="${n}"`)),
  'Ghi chú chưa thống nhất',
)
const bm = read('src', 'components', 'bookmarks', 'BookmarkTab.vue')
const bmT = template(bm)
const tbStart = bmT.indexOf('class="bm-tab__toolbar"')
const toolbar = bmT.slice(tbStart, bmT.indexOf('<InlineSearch', tbStart))
check(
  'M3 Bookmark: "☁↑ Sao lưu ngay"; ⤓ ⟳ 🗑 ở đầu cột TRÌNH DUYỆT; dòng sao lưu ↶ 🗑 kiểu chung; ✕ ở KẾT QUẢ',
  /ds-primary[\s\S]{0,200}name="upload-cloud"/.test(toolbar) &&
    !/exportHtml|deleteAll|bookmark\.refresh/.test(toolbar) &&
    ['download', 'refresh', 'trash', 'restore', 'close'].every((n) => bmT.includes(`name="${n}"`)) &&
    !/IconDeleteButton|IconRestoreButton/.test(bm) &&
    !exists('src', 'components', 'ui', 'IconDeleteButton.vue') &&
    !exists('src', 'components', 'ui', 'IconRestoreButton.vue'),
  'Bookmark chưa thống nhất',
)
const cbd = read('src', 'components', 'sync', 'ConflictBackupsDialog.vue')
const scd = read('src', 'components', 'sync', 'SyncConflictDialog.vue')
check(
  'M4 Hộp thoại xung đột: dòng ↶ 🗑 icon; chữ qua i18n (không còn tiếng Anh IN HOA cứng)',
  /name="restore"/.test(cbd) &&
    /name="trash"/.test(cbd) &&
    !/SYNC CONFLICT|YOUR EDITS WERE|PREVIEW \(first|LOCAL:|CLOUD:|\.\.\.and more/.test(cbd + scd) &&
    /t\('sync\.conflict/.test(scd) &&
    /t\('sync\.backups/.test(cbd),
  'còn chữ cứng',
)
const settings = read('src', 'components', 'layout', 'SettingsModal.vue')
const app = read('src', 'pages', 'App.vue')
check(
  'M5 Settings "🔓 Mở khóa" / "🔒 Khóa ngay"; recovery "⧉ Sao chép"; header 👤 đăng nhập (U17) / ⇥ đăng xuất / ⚙',
  /name="unlock"/.test(settings) &&
    /name="lock"/.test(settings) &&
    /name="copy"/.test(read('src', 'components', 'account', 'AccountEncryptionSetupModal.vue')) &&
    // U22 (đổi có chủ đích): 👤 / ⇥ chuyển vào AccountMenu.vue (header, kiểu Gmail).
    ['user', 'log-out', 'settings'].every((n) =>
      (app + read('src', 'components', 'layout', 'AccountMenu.vue')).includes(`name="${n}"`),
    ),
  'chưa thống nhất',
)
check(
  'M6 "Lỗi:" thay "[LỖI]"',
  /'common\.error': 'Lỗi:'/.test(vi) && /'common\.error': 'Error:'/.test(en),
  'chưa đổi',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U15-icon-language.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U15 đúng spec.')
