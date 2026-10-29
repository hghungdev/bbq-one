/**
 * FAILING TEST — U4 (popup cố định 800 px) + U5 (tìm kiếm 🔍 cho Notes/Bookmark) + U6 (chip lịch).
 *
 * Chạy:   node specs/U4-U6-popup-width-inline-search-agenda.test.mjs
 *
 * RED trên ee9d1e5:
 *   - U4: html { min-width: 720px; width: 100% } → popup co giãn theo nội dung (gõ tìm bookmark co lại).
 *   - U5: header còn SearchBar toàn chiều ngang; chưa có InlineSearch dùng chung / Ctrl+F theo tab.
 *   - U6: còn 2 banner CalendarTodayBanner; chưa có chip lịch + utils/calendarAgenda.ts.
 * GREEN sau khi áp specs/U4-U6-popup-width-inline-search-agenda.spec.md.
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

function loadTsModule(filePath, mocks = {}) {
  const src = fs.readFileSync(filePath, 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const requireShim = (spec) => {
    if (spec in mocks) return mocks[spec]
    throw new Error(`Unmocked import in ${path.basename(filePath)}: ${spec}`)
  }
  new Function('require', 'module', 'exports', js)(requireShim, mod, mod.exports)
  return mod.exports
}

const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return null
  }
}
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p))
const appSrc = read('src', 'pages', 'App.vue')
const viSrc = read('src', 'i18n', 'vi.ts')
const enSrc = read('src', 'i18n', 'en.ts')
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')

// ═════════════════════════════════════════════════════════════════════════════
console.log('U4 — popup cố định 800 px (gõ tìm bookmark không làm popup co lại)')
{
  const css = read('src', 'assets', 'styles', 'global.css') ?? ''
  const start = css.indexOf('\nhtml {')
  const htmlBlock = start === -1 ? '' : css.slice(start, css.indexOf('}', start))
  check('U4.1 --popup-width: 800px', /--popup-width:\s*800px/.test(css), 'chưa có biến bề rộng cố định')
  check(
    'U4.2 html { width: var(--popup-width) } — không còn width: 100% / min-width (co giãn theo nội dung)',
    /width:\s*var\(--popup-width\)/.test(htmlBlock) &&
      !/width:\s*100%/.test(htmlBlock) &&
      !/min-width/.test(htmlBlock),
    flat(htmlBlock),
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nU5 — tìm kiếm thu vào nút 🔍 cho Notes + Bookmark (dùng chung với Calendar)')
const inlineSrc = read('src', 'components', 'ui', 'InlineSearch.vue')
{
  check('U5.1 có components/ui/InlineSearch.vue', inlineSrc !== null, 'file chưa tồn tại')
  const s = inlineSrc ?? ''
  check(
    'U5.2 debounce 300 ms → emit search; ✕ / Esc → emit clear',
    s.includes('setTimeout(') &&
      /300\)/.test(s) &&
      s.includes("emit('search'") &&
      s.includes("emit('clear')") &&
      s.includes("'Escape'"),
    'thiếu debounce / nhánh đóng',
  )
  check(
    'U5.3 mặc định thu gọn, còn query thì mở sẵn; nghe focusRequest (Ctrl+F)',
    /ref\(\s*props\.query\.trim\(\)\.length > 0\s*\)/.test(s) && s.includes('props.focusRequest'),
    'thiếu mở sẵn / focusRequest',
  )
  check(
    'U5.4 đồng bộ từ store so sánh SAU trim (không ăn dấu cách cuối khi đang gõ)',
    /localQuery\.value\.trim\(\)/.test(s),
    'store lưu query đã trim → ghi đè ô nhập',
  )
  check('U5.5 rời ô khi trống → thu gọn (focusout)', /focusout/i.test(s), 'không có xử lý focusout')
  check(
    'U5.6 slot collapsed (tiêu đề cột) + suffix (số kết quả)',
    s.includes('name="collapsed"') && s.includes('name="suffix"'),
    'thiếu slot',
  )

  check(
    'U5.7 App.vue không còn SearchBar (header gọn một hàng); SearchBar.vue đã gỡ',
    !/<SearchBar/.test(appSrc) && !/import SearchBar/.test(appSrc) && !exists('src', 'components', 'layout', 'SearchBar.vue'),
    'header vẫn có ô search toàn chiều ngang',
  )

  // U11 (đổi có chủ đích): ô tìm ghi chú chuyển lên đầu cột Thư mục (Sidebar) — đọc là "tìm tất cả".
  const noteListSrc = read('src', 'components', 'layout', 'Sidebar.vue') ?? ''
  check(
    'U5.8 Notes: InlineSearch (đầu cột Thư mục — U11) → runSearch / clearSearch / searchFocusRequest',
    /<InlineSearch[\s\S]*?\/?>/.test(noteListSrc) &&
      noteListSrc.includes('runSearch(') &&
      noteListSrc.includes('clearSearch()') &&
      noteListSrc.includes('notes.searchFocusRequest'),
    'đầu cột Thư mục chưa có ô tìm',
  )

  const bmTabSrc = read('src', 'components', 'bookmarks', 'BookmarkTab.vue') ?? ''
  // U35 (đổi có chủ đích): hàng thanh công cụ đã bỏ — ô tìm luôn hiện ở đầu cột Bookmark trình duyệt.
  const treeColStart = bmTabSrc.indexOf('class="bm-tab__tree-col"')
  const treeColHead = treeColStart === -1 ? '' : bmTabSrc.slice(treeColStart, bmTabSrc.indexOf('<SectionHeader', treeColStart))
  check(
    'U5.9 BookmarkTab: InlineSearch ở đầu cột Bookmark trình duyệt (U35) → setSearchQuery / clearBookmarkSearch / searchFocusRequest',
    treeColHead.includes('<InlineSearch') &&
      bmTabSrc.includes('setSearchQuery(') &&
      bmTabSrc.includes('bm.searchFocusRequest'),
    'thanh công cụ bookmark chưa có 🔍',
  )

  const calInlineSrc = read('src', 'components', 'calendar', 'CalendarInlineSearch.vue') ?? ''
  check(
    'U5.10 CalendarInlineSearch dùng InlineSearch (một hành vi cho cả 3 tab)',
    calInlineSrc.includes('<InlineSearch'),
    'Calendar còn bản riêng',
  )

  const keydownStart = appSrc.indexOf("e.key.toLowerCase() === 'f'")
  const keydownBlock = keydownStart === -1 ? '' : appSrc.slice(keydownStart, keydownStart + 500)
  check(
    'U5.11 Ctrl+F mở ô tìm của tab đang mở (notes / bookmarks / calendar)',
    keydownBlock.includes('calendarEvents.requestSearchFocus()') &&
      keydownBlock.includes('bookmarks.requestSearchFocus()') &&
      keydownBlock.includes('notes.requestSearchFocus()') &&
      !appSrc.includes('searchBarRef'),
    flat(keydownBlock).slice(0, 220),
  )

  const notesStoreSrc = read('src', 'stores', 'notes.ts') ?? ''
  check(
    'U5.12 notes store: searchFocusRequest + requestSearchFocus() (export)',
    /const searchFocusRequest = ref\(0\)/.test(notesStoreSrc) &&
      /function requestSearchFocus\(\)/.test(notesStoreSrc) &&
      /return \{[\s\S]*searchFocusRequest,[\s\S]*requestSearchFocus,[\s\S]*\}\s*\}\)\s*$/.test(notesStoreSrc),
    'thiếu API focus cho Ctrl+F',
  )

  // Bookmarks store (CODE THẬT): requestSearchFocus chỉ kích UI, không đụng query.
  const vueMock = {
    ref: (v) => ({ value: v }),
    computed: (fn) => ({
      get value() {
        return fn()
      },
    }),
  }
  let bm = null
  try {
    bm = loadTsModule(path.join(ROOT, 'src', 'stores', 'bookmarks.ts'), {
      pinia: { defineStore: (_n, setup) => setup },
      vue: vueMock,
      '@/constants/storage': { BOOKMARKS_CACHE_KEY: 'bm' },
      '@/services/bookmarks.service': { bookmarksService: {} },
      '@/services/networkReachability.service': { isOnline: () => true },
      '@/stores/undoToast': { useUndoToastStore: () => ({}) },
      '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
      '@/utils/networkErrors': { isNetworkError: () => false },
      '@/utils/cacheWrite': { safeCacheWrite: async () => true, stripEncryptedBackupTrees: (x) => x },
    }).useBookmarksStore()
  } catch (e) {
    check('U5.13 bookmarks store load được', false, e.message)
  }
  if (bm) {
    const before = bm.searchFocusRequest?.value
    bm.setSearchQuery('github')
    if (typeof bm.requestSearchFocus === 'function') bm.requestSearchFocus()
    check(
      'U5.13 bookmarks.requestSearchFocus() tăng searchFocusRequest, giữ nguyên query',
      typeof before === 'number' && bm.searchFocusRequest.value === before + 1 && bm.searchQuery.value === 'github',
      `before=${before} after=${bm.searchFocusRequest?.value} q=${bm.searchQuery.value}`,
    )
  }

  const missing = ['search.openNotes', 'search.openBookmarks', 'search.close'].filter(
    (k) => !viSrc.includes(`'${k}'`) || !enSrc.includes(`'${k}'`),
  )
  check('U5.14 i18n vi + en', missing.length === 0, `thiếu: ${JSON.stringify(missing)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nU6 — chip lịch trên header thay 2 banner')
let agendaMod = null
try {
  agendaMod = loadTsModule(path.join(ROOT, 'src', 'utils', 'calendarAgenda.ts'))
} catch (e) {
  check('U6.1 utils/calendarAgenda.ts load được', false, e.message)
}
if (agendaMod) {
  const { buildAgenda, agendaChip } = agendaMod
  const ev = (o) => ({
    id: o.id,
    title: o.title,
    position: o.position,
    is_done: o.done ?? false,
    color: o.color ?? null,
    start_time: o.start ?? null,
    end_time: o.end ?? null,
  })
  const T = '2026-10-28'
  const M = '2026-10-29'
  const data = {
    [T]: [
      ev({ id: 't2', title: ' OT - 2 Hours ', position: 2, start: '09:00', end: '11:00' }),
      ev({ id: 't1', title: 'HSBC T1279', position: 1, done: true, color: '#e11' }),
      ev({ id: 't3', title: '   ', position: 3 }),
    ],
    [M]: [
      ev({ id: 'm3', title: 'OT - 2 Hours', position: 3 }),
      ev({ id: 'm1', title: 'VIB', position: 1 }),
      ev({ id: 'm2', title: 'HSBC', position: 2 }),
    ],
  }
  const eventsFor = (d) => (k) => d[k] ?? []

  const a = buildAgenda(eventsFor(data), T, M, null)
  check(
    'U6.1 hôm nay: sắp theo position, trim, bỏ tiêu đề rỗng; giữ giờ / xong / màu',
    a.today?.dateKey === T &&
      JSON.stringify(a.today.items.map((i) => i.title)) === JSON.stringify(['HSBC T1279', 'OT - 2 Hours']) &&
      a.today.items[0].done === true &&
      a.today.items[0].color === '#e11' &&
      a.today.items[1].time === '09:00–11:00' &&
      a.today.items[0].time === null,
    JSON.stringify(a.today),
  )
  check(
    'U6.2 ngày mai: đủ 3 sự kiện theo position',
    a.tomorrow?.dateKey === M &&
      JSON.stringify(a.tomorrow.items.map((i) => i.title)) === JSON.stringify(['VIB', 'HSBC', 'OT - 2 Hours']),
    JSON.stringify(a.tomorrow),
  )
  const dismissed = buildAgenda(eventsFor(data), T, M, M)
  check(
    'U6.3 đã ẩn nhắc đúng ngày mai → tomorrow = null (hôm nay vẫn còn)',
    dismissed.tomorrow === null && dismissed.today !== null,
    JSON.stringify(dismissed),
  )
  check(
    'U6.4 ẩn nhắc của NGÀY KHÁC không ảnh hưởng ngày mai',
    buildAgenda(eventsFor(data), T, M, '2026-10-20').tomorrow !== null,
    'ngày mai bị ẩn nhầm',
  )

  const chipBoth = agendaChip(a)
  check(
    'U6.5 chip ưu tiên hôm nay; có cả ngày mai → tomorrowCount = 3',
    chipBoth?.tone === 'today' &&
      chipBoth.dateKey === T &&
      JSON.stringify(chipBoth.titles) === JSON.stringify(['HSBC T1279', 'OT - 2 Hours']) &&
      chipBoth.tomorrowCount === 3,
    JSON.stringify(chipBoth),
  )
  const onlyTomorrow = agendaChip(buildAgenda(eventsFor({ [M]: data[M] }), T, M, null))
  check(
    'U6.6 chỉ có ngày mai → tone tomorrow, không đếm thêm',
    onlyTomorrow?.tone === 'tomorrow' && onlyTomorrow.dateKey === M && onlyTomorrow.tomorrowCount === 0,
    JSON.stringify(onlyTomorrow),
  )
  check(
    'U6.7 không có gì (hoặc chỉ ngày mai đã ẩn) → không hiện chip',
    agendaChip(buildAgenda(eventsFor({}), T, M, null)) === null &&
      agendaChip(buildAgenda(eventsFor({ [M]: data[M] }), T, M, M)) === null,
    'chip vẫn hiện',
  )
}

{
  const chipSrc = read('src', 'components', 'calendar', 'CalendarAgendaChip.vue') ?? ''
  check(
    'U6.8 CalendarAgendaChip: nút chip + popover hộp thoại (aria-haspopup / aria-expanded / role=dialog)',
    chipSrc.includes('buildAgenda(') &&
      chipSrc.includes('aria-haspopup="dialog"') &&
      chipSrc.includes(':aria-expanded') &&
      chipSrc.includes('role="dialog"'),
    'thiếu chip / popover',
  )
  // U10 (đổi có chủ đích — yêu cầu của Sir): bỏ nút "Ẩn" ở mục Ngày mai.
  check(
    'U6.9 Esc + bấm ra ngoài đóng popover; emit open-calendar(dateKey)',
    chipSrc.includes("'Escape'") &&
      /pointerdown/.test(chipSrc) &&
      /emit\('open-calendar',\s*\w/.test(chipSrc),
    'thiếu đóng / mở lịch',
  )
  check(
    'U6.10 không chạy chữ, không tự ẩn theo giờ',
    chipSrc.length > 0 && !/@keyframes|marquee/i.test(chipSrc) && !chipSrc.includes('setTimeout('),
    'có animation chạy chữ / timer tự ẩn',
  )

  const topRowStart = appSrc.indexOf('shell__header-row--top')
  const iLeft = appSrc.indexOf('shell__header-left', topRowStart)
  const iChip = appSrc.indexOf('<CalendarAgendaChip', topRowStart)
  const iRight = appSrc.indexOf('class="shell__header-right"', topRowStart)
  check(
    'U6.11 App.vue: chip trong hàng header trên cùng, giữa nhóm tab và nhóm icon',
    iChip !== -1 && iLeft < iChip && iChip < iRight,
    `left=${iLeft} chip=${iChip} right=${iRight}`,
  )
  check(
    'U6.12 bỏ CalendarTodayBanner (2 dải banner) — component đã gỡ',
    !appSrc.includes('CalendarTodayBanner') && !exists('src', 'components', 'calendar', 'CalendarTodayBanner.vue'),
    'còn banner',
  )
  const handlerStart = appSrc.indexOf('function onOpenCalendarFromAgenda(')
  const handler = handlerStart === -1 ? '' : appSrc.slice(handlerStart, appSrc.indexOf('\n  }', handlerStart))
  check(
    'U6.13 open-calendar → tab Lịch + nhảy đúng ngày được bấm (không cố định hôm nay)',
    /@open-calendar="onOpenCalendarFromAgenda"/.test(appSrc) &&
      /function onOpenCalendarFromAgenda\(dateKey: string\)/.test(appSrc) &&
      handler.includes("activeTab.value = 'calendar'") &&
      handler.includes('focusCalendarCellFromSearch(dateKey)'),
    flat(handler).slice(0, 200),
  )
  const agendaKeys = [
    'calendar.agenda.today',
    'calendar.agenda.tomorrow',
    'calendar.agenda.tomorrowCount',
    'calendar.agenda.chipAria',
    'calendar.agenda.panelTitle',
    'calendar.agenda.openDay',
    'calendar.agenda.listSeparator',
  ]
  const missing = agendaKeys.filter((k) => !viSrc.includes(`'${k}'`) || !enSrc.includes(`'${k}'`))
  check('U6.14 i18n calendar.agenda.* vi + en', missing.length === 0, `thiếu: ${JSON.stringify(missing)}`)
  check(
    'U6.15 gỡ i18n calendar.banner.* (không còn ai dùng)',
    !viSrc.includes("'calendar.banner.") && !enSrc.includes("'calendar.banner."),
    'khóa i18n mồ côi',
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U4-U6-popup-width-inline-search-agenda.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U4 + U5 + U6 đúng spec.')
