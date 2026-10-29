/**
 * FAILING TEST — U11: áp "ADN popover" (bảng Lịch sắp tới) cho toàn bộ layout.
 *
 * Chạy:   node specs/U11-popover-design-language.test.mjs
 *
 * Kiểm cấu trúc chính (giao diện kiểm bằng ảnh chụp Chromium, ghi trong ROADMAP-U).
 * GREEN sau khi áp specs/U11-popover-design-language.spec.md.
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
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}
const template = (src) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'))

console.log('Dùng chung')
const ds = read('src', 'assets', 'styles', 'ds.css')
check(
  'D0.1 ds.css: ds-label / ds-text-action / ds-icon-action / ds-row(--selected) — nạp trong main.ts',
  ['.ds-label', '.ds-text-action', '.ds-icon-action', '.ds-row', '.ds-row--selected'].every((c) => ds.includes(c)) &&
    /inset 3px 0 0/.test(ds) &&
    read('src', 'main.ts').includes("./assets/styles/ds.css"),
  'thiếu lớp dùng chung',
)
const sh = read('src', 'components', 'ui', 'SectionHeader.vue')
check(
  'D0.2 SectionHeader: label + meta + tone + slot hành động',
  /label: string/.test(sh) && /meta\?:/.test(sh) && /tone\?:/.test(sh) && sh.includes('<slot'),
  'chưa có SectionHeader',
)
const inline = read('src', 'components', 'ui', 'InlineSearch.vue')
check('D0.3 InlineSearch có chế độ persistent (luôn là ô nhập)', /persistent\?: boolean/.test(inline), 'thiếu persistent')

console.log('\nA — Ghi chú')
const sidebar = read('src', 'components', 'layout', 'Sidebar.vue')
const sbT = template(sidebar)
check(
  'A1 ô "tìm trong tất cả ghi chú" ở đầu cột Thư mục (persistent) — runSearch / clearSearch / Ctrl+F',
  /<InlineSearch[\s\S]*?persistent/.test(sbT) &&
    sidebar.includes('runSearch(') &&
    sidebar.includes('clearSearch()') &&
    sidebar.includes('notes.searchFocusRequest') &&
    sbT.indexOf('<InlineSearch') < sbT.indexOf('<FolderItem'),
  'ô tìm chưa ở đầu cột Thư mục',
)
check(
  'A2 Thư mục: SectionHeader + nút ＋ (bỏ khối "Add folder" ở đáy)',
  /<SectionHeader[\s\S]*?openCreateFolderModal/.test(sbT) && !sidebar.includes('sidebar__foot--add'),
  'còn khối Add folder ở đáy',
)
const noteList = read('src', 'components', 'layout', 'NoteList.vue')
const nlT = template(noteList)
check(
  'A3 Ghi chú: SectionHeader ghi rõ phạm vi (tên folder / kết quả mọi thư mục) + ＋; bỏ "Add note" ở đáy; không còn ô tìm ở đây',
  /<SectionHeader/.test(nlT) &&
    nlT.includes("t('notes.scopeAllFolders')") &&
    /openCreateNoteModal/.test(nlT) &&
    !noteList.includes('note-list__foot--add') &&
    !nlT.includes('<InlineSearch'),
  'đầu cột Ghi chú chưa ghi phạm vi / còn Add note ở đáy',
)
const folderItem = read('src', 'components', 'folders', 'FolderItem.vue')
const noteItem = read('src', 'components', 'notes', 'NoteItem.vue')
check(
  'A4 folder / ghi chú: dòng phẳng ds-row, đang chọn ds-row--selected',
  /ds-row/.test(template(folderItem)) && /ds-row--selected/.test(folderItem) && /ds-row/.test(template(noteItem)) && /ds-row--selected/.test(noteItem),
  'chưa dùng ds-row',
)
const editor = read('src', 'components', 'notes', 'NoteEditor.vue')
check(
  'A5 vùng soạn thảo: SectionHeader + icon trong suốt (bỏ khung quanh nút)',
  /<SectionHeader/.test(template(editor)) && /ds-icon-action/.test(template(editor)) && !/note-editor__head-actions/.test(editor),
  'còn khung nút',
)

console.log('\nB — Lịch')
const nav = read('src', 'components', 'calendar', 'CalendarMonthNav.vue')
check(
  'B1 hàng tháng: ‹ › icon trong suốt, "Hôm nay" nút chữ, bỏ RetroButton',
  !nav.includes('<RetroButton') && /ds-icon-action/.test(nav) && /ds-text-action/.test(nav),
  'còn nút pill',
)
const calCss = read('src', 'assets', 'styles', 'calendar-events.css')
check(
  'B2 sự kiện có vạch màu 3 px ở cả light (không chỉ dark)',
  /--cal-event-rail/.test(calCss) && /\n(\.cal-cell )?\.cal-cell__event[^{]*\{[^}]*border-left:\s*3px solid var\(--cal-event-rail\)/.test(calCss),
  'light chưa có vạch màu',
)
const cell = read('src', 'components', 'calendar', 'CalendarCell.vue')
check('B3 hôm nay: số ngày trong vòng tròn màu nhấn', /\.cal-cell--today \.cal-cell__day[^}]*background:\s*var\(--accent\)/.test(cell), 'chưa có vòng tròn')

console.log('\nC — Bookmark')
const bm = read('src', 'components', 'bookmarks', 'BookmarkTab.vue')
const tbStart = bm.indexOf('class="bm-tab__toolbar"')
const toolbar = tbStart === -1 ? '' : bm.slice(tbStart, bm.indexOf('<InlineSearch', tbStart))
// U15 (đổi có chủ đích): "Xóa tất cả" không còn là nút chữ đỏ trên thanh công cụ — thành icon 🗑 ở đầu
// cột TRÌNH DUYỆT (specs/U15-icon-language.spec.md, quy tắc 3 + 6).
// U33 (đổi có chủ đích): "Sao lưu ngay" không còn là nút đặc trên thanh công cụ — thành icon ☁↑ ở đầu cột SAO LƯU
// (specs/U33-bookmark-backup-icon.spec.md).
check(
  'C1 thanh công cụ: bỏ RetroButton pill, hết nút chữ (Sao lưu → icon đầu cột SAO LƯU — U33; Xuất / Tải lại / Xóa tất cả → icon đầu cột TRÌNH DUYỆT — U15)',
  toolbar.length > 0 && !toolbar.includes('<RetroButton') && !/ds-primary/.test(toolbar),
  'còn nút pill',
)
check('C2 hai cột dùng SectionHeader', (template(bm).match(/<SectionHeader/g) ?? []).length >= 2, 'chưa dùng SectionHeader')

console.log('\nD — Settings & chữ nút')
const settings = read('src', 'components', 'layout', 'SettingsModal.vue')
check(
  'D1 Settings: "Đóng" là nút chữ (bỏ khối CLOSE); mục accordion không còn hộp viền',
  !/<RetroButton[^>]*class="settings-close"/.test(settings) && /ds-text-action[^"]*settings-close|settings-close[^"]*ds-text-action/.test(settings) &&
    !/\.set-acc \{[^}]*border: 1px solid/.test(read('src', 'components', 'layout', 'SettingsAccordionSection.vue')),
  'còn khối CLOSE / hộp accordion',
)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const val = (src, k) => (new RegExp(`'${k.replace(/\./g, '\\.')}':\\s*'([^']*)'`).exec(src) ?? [])[1] ?? ''
const keys = ['calendar.nav.today', 'calendar.overdue.btnLater', 'calendar.overdue.btnConfirmCount', 'settings.closeBtn']
const upper = keys.flatMap((k) => [['vi', k, val(vi, k)], ['en', k, val(en, k)]]).filter(([, , v]) => v === '' || v === v.toUpperCase())
check('D2 chữ nút viết thường (IN HOA chỉ cho nhãn mục)', upper.length === 0, JSON.stringify(upper))

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U11 đúng spec.')
