/**
 * FAILING TEST — U35: Bookmark — bỏ hàng thanh công cụ; ô tìm luôn hiện ở đầu cột Bookmark trình duyệt.
 *
 * Chạy:   node specs/U35-bookmark-search-in-column.test.mjs
 * GREEN sau khi áp specs/U35-bookmark-search-in-column.spec.md.
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

const bm = read('src', 'components', 'bookmarks', 'BookmarkTab.vue')
const tpl = bm.slice(bm.indexOf('<template>'), bm.lastIndexOf('</template>'))
const script = bm.slice(0, bm.indexOf('<template>'))
const css = bm.slice(bm.indexOf('<style'))
const rule = (sel) => (new RegExp(`\\n${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`).exec(css) ?? ['', ''])[1]
const prop = (block, name) => (new RegExp(`(?:^|\\n)\\s*${name}:\\s*([^;]+);`).exec(block) ?? [])[1]?.trim()

const treeCol = tpl.slice(tpl.indexOf('class="bm-tab__tree-col"'))
const search = (/<InlineSearch[\s\S]*?\/>/.exec(treeCol) ?? [''])[0]

console.log('T1 — bỏ hàng thanh công cụ')
check('U35.1 không còn bm-tab__toolbar (template + CSS)', !/bm-tab__toolbar|bm-tab__hint/.test(bm), 'còn thanh công cụ')
check('U35.2 thân tab lên sát header: lề trên 12 px', prop(rule('.bm-tab__body'), 'padding') === '12px', prop(rule('.bm-tab__body'), 'padding'))

console.log('\nT2 — ô tìm ở đầu cột Bookmark trình duyệt')
check(
  'U35.3 InlineSearch persistent trong bm-tab__tree-col, TRƯỚC SectionHeader; giữ id / Ctrl+F / setSearchQuery / clear',
  !!search && treeCol.indexOf('<InlineSearch') < treeCol.indexOf('<SectionHeader') && /\bpersistent\b/.test(search) &&
    /input-id="bbqone-bookmark-search"/.test(search) && /:focus-request="bm\.searchFocusRequest"/.test(search) &&
    /bm\.setSearchQuery\(q\)/.test(search) && /@clear="bm\.clearBookmarkSearch\(\)"/.test(search) &&
    (tpl.match(/<InlineSearch/g) ?? []).length === 1,
  search || 'chưa có ô tìm trong cột',
)
const sticky = rule('.bm-tab__search')
check(
  'U35.4 ô tìm dính đầu khung khi cuộn (sticky, nền như khung, nổi trên cây)',
  prop(sticky, 'position') === 'sticky' && /^-?\d+px$/.test(prop(sticky, 'top') ?? '') && prop(sticky, 'background') === 'var(--bg-panel)' &&
    Number(prop(sticky, 'z-index')) >= 1,
  JSON.stringify(sticky),
)
check(
  'U35.5 đầu KẾT QUẢ bỏ ✕ trùng (✕ nằm trong ô tìm); i18n bookmark.clearTitle gỡ (vi + en)',
  !/bookmark\.clearTitle/.test(bm) && !/'bookmark\.clearTitle'/.test(read('src', 'i18n', 'vi.ts') + read('src', 'i18n', 'en.ts')),
  'còn ✕ trùng',
)

console.log('\nT3 — "Sao lưu lần cuối" vào tooltip ☁↑; chữ gợi ý nói rõ phạm vi')
check(
  'U35.6 backupTitle = "Sao lưu ngay" (+ " · Sao lưu lần cuối: …" khi có); ☁↑ dùng cho title + aria-label',
  /const backupTitle = computed\(/.test(script) && /bookmark\.lastBackup/.test(script) && /bookmark\.backupNow/.test(script) &&
    /:title="backupTitle"/.test(tpl) && /:aria-label="backupTitle"/.test(tpl),
  'chưa có backupTitle',
)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
check(
  'U35.7 search.placeholderBookmarks nói rõ cả bản sao lưu (vi + en)',
  /'search\.placeholderBookmarks': 'Tìm trong bookmark và bản sao lưu…'/.test(vi) && /'search\.placeholderBookmarks': 'Search bookmarks & backups…'/.test(en),
  'chữ gợi ý chưa đổi',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U35-bookmark-search-in-column.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U35 đúng spec.')
