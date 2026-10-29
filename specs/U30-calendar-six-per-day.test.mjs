/**
 * FAILING TEST — U30: lịch tối đa 6 sự kiện / ngày; ô hiện 2 + "+n xem thêm"; chip ghi số khi tên không vừa hết;
 * bảng: Ngày mai 3 dòng + "Xem thêm n".
 *
 * Chạy:   node specs/U30-calendar-six-per-day.test.mjs
 * GREEN sau khi áp specs/U30-calendar-six-per-day.spec.md.
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
  const js = ts.transpileModule(read(...rel.split('/')), {
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

console.log('T1 — hằng số')
const C = load('src/constants/calendar.ts')
check('U30.1 CALENDAR_MAX_EVENTS_PER_DAY = 6', C.CALENDAR_MAX_EVENTS_PER_DAY === 6, String(C.CALENDAR_MAX_EVENTS_PER_DAY))
check('U30.2 CALENDAR_CELL_EVENT_LIMIT = 2 (tách khỏi giới hạn)', C.CALENDAR_CELL_EVENT_LIMIT === 2, String(C.CALENDAR_CELL_EVENT_LIMIT))

console.log('\nT2 — kho máy (CODE THẬT): thêm đủ 6, cái thứ 7 bị chặn')
{
  const arr = []
  const L = load('src/services/localFirst/localCalendarEvents.service.ts', {
    '@/constants/calendar': C,
    './localStore.service': {
      localStore: {
        getArray: async () => arr.slice(),
        pushItem: async (_k, item) => void arr.push(item),
        setArray: async () => {},
      },
    },
    '@/types/localFirst': { LOCAL_STORAGE_KEYS: { calendarEvents: 'bbqone_local_calendar_events' } },
  }).localCalendarEventsService
  let err = null
  try {
    for (let i = 0; i < 6; i++) await L.create({ event_date: '2026-10-29', title: `e${i}`, position: i })
  } catch (e) {
    err = e
  }
  let seventh = null
  try {
    await L.create({ event_date: '2026-10-29', title: 'e6', position: 6 })
  } catch (e) {
    seventh = e
  }
  check('U30.3 6 sự kiện cùng ngày → OK; thứ 7 → MAX_EVENTS_PER_DAY', !err && arr.length === 6 && seventh?.message === 'MAX_EVENTS_PER_DAY', `${err?.message ?? ''} / ${arr.length} / ${seventh?.message}`)
}

console.log('\nT3 — chip: tên vừa hết thì hiện tên, không thì ghi số (CODE THẬT)')
const A = load('src/utils/calendarAgenda.ts')
const need = A.titlesNeedCount
if (typeof need !== 'function') {
  check('U30.4 export titlesNeedCount', false, 'chưa có')
} else {
  check('U30.4 mọi tên vừa (60+10+70 ≤ 200) → không ghi số', need([60, 70], 200, 10) === false, String(need([60, 70], 200, 10)))
  check('U30.5 không vừa hết (140 > 120) → ghi số', need([60, 70], 120, 10) === true, String(need([60, 70], 120, 10)))
  check('U30.6 vừa khít (90 ≤ 90) → không ghi số', need([40, 40], 90, 10) === false, String(need([40, 40], 90, 10)))
  check('U30.7 1 tên dài quá chỗ → vẫn hiện tên (CSS cắt "…"); 0 tên → không ghi số', need([400], 120, 10) === false && need([], 120, 10) === false, `${need([400], 120, 10)} / ${need([], 120, 10)}`)
  const six = [30, 30, 30, 30, 30, 30] // 180 + 5×10 = 230
  check('U30.8 6 tên: 230 ≤ 230 → hiện đủ 6 tên; 229 → ghi số (không còn "vài tên + +n")', need(six, 230, 10) === false && need(six, 229, 10) === true, `${need(six, 230, 10)} / ${need(six, 229, 10)}`)
}
check('U30.9 bỏ fitTitleCount (không còn hiện một phần + "+n")', !('fitTitleCount' in A), 'vẫn export fitTitleCount')

console.log('\nT4 — bảng: Ngày mai 3 dòng + "Xem thêm n" (CODE THẬT)')
check('U30.10 AGENDA_TOMORROW_PREVIEW = 3', A.AGENDA_TOMORROW_PREVIEW === 3, String(A.AGENDA_TOMORROW_PREVIEW))
if (typeof A.previewItems !== 'function') {
  check('U30.11 export previewItems', false, 'chưa có')
} else {
  const items = ['a', 'b', 'c', 'd', 'e', 'f']
  const p1 = A.previewItems(items, 3, false)
  const p2 = A.previewItems(items, 3, true)
  const p3 = A.previewItems(['a', 'b', 'c'], 3, false)
  const p4 = A.previewItems(['a', 'b', 'c', 'd'], 3, false)
  check(
    'U30.11 6 mục → 3 + "thêm 3"; mở rộng → đủ 6; 3 mục → đủ, không nút; 4 mục → 3 + "thêm 1"',
    p1.shown.join('') === 'abc' && p1.more === 3 && p2.shown.join('') === 'abcdef' && p2.more === 0 &&
      p3.shown.join('') === 'abc' && p3.more === 0 && p4.shown.join('') === 'abc' && p4.more === 1,
    JSON.stringify([p1, p2, p3, p4]),
  )
  check('U30.12 previewItems không sửa mảng gốc', items.length === 6, String(items.length))
}

console.log('\nT5 — ô lịch (tĩnh)')
const cell = read('src', 'components', 'calendar', 'CalendarCell.vue')
const cellTpl = cell.slice(cell.indexOf('<template>'), cell.lastIndexOf('</template>'))
const cellScript = cell.slice(0, cell.indexOf('<template>'))
const moreBtn = (/<button[^>]*class="cal-cell__more"[\s\S]*?<\/button>/.exec(cellTpl) ?? [''])[0]
check(
  'U30.13 ô: tối đa CALENDAR_CELL_EVENT_LIMIT dòng + nút "+n xem thêm" (i18n calendar.cell.more, tooltip moreTitle)',
  /slice\(0, CALENDAR_CELL_EVENT_LIMIT\)/.test(cellScript) && !!moreBtn && /t\('calendar\.cell\.more', \{ n: overflowCount \}\)/.test(moreBtn) &&
    /t\('calendar\.cell\.moreTitle', \{ n: events\.length \}\)/.test(moreBtn) && !/cal-cell__overflow/.test(cell),
  'chưa có nút xem thêm',
)
const onMore = (/function onMoreClick\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(cellScript) ?? ['', ''])[1]
check(
  'U30.14 bấm "xem thêm" → mở hộp của ngày, không lan lên ô, chạy cả ngày đã qua',
  /@click="onMoreClick\(\$event\)"/.test(moreBtn) && /stopPropagation\(\)/.test(onMore) && /store\.openModalForDate\(dateKey\.value\)/.test(onMore) &&
    !/isPastDay/.test(onMore) && /function onCellClick\(\)[^{]*\{\s*if \(isPastDay\.value\) return/.test(cellScript),
  onMore || 'chưa có onMoreClick',
)

console.log('\nT6 — chip + bảng (tĩnh)')
const chip = read('src', 'components', 'calendar', 'CalendarAgendaChip.vue')
const chipScript = chip.slice(0, chip.indexOf('<template>'))
const chipTpl = chip.slice(chip.indexOf('<template>'), chip.lastIndexOf('</template>'))
const trigger = (/<button\s+ref="triggerRef"[\s\S]*?<\/button>/.exec(chipTpl) ?? [''])[0]
check(
  'U30.15 chip đo thật (measureText + ResizeObserver) → titlesNeedCount; ghi số qua calendar.agenda.eventCount; hết viên "+n"',
  /titlesNeedCount\(/.test(chipScript) && /measureText\(/.test(chipScript) && /ResizeObserver/.test(chipScript) &&
    /t\('calendar\.agenda\.eventCount', \{ n: /.test(chipScript) && !/agenda-chip__plus|hiddenCount|fitTitleCount/.test(chip),
  'chip vẫn gom "+n"',
)
check(
  'U30.16 tooltip + aria-label vẫn đọc ĐỦ mọi tên (chipTitles)',
  /:title="[^"]*chipTitles/.test(trigger) && /list:[^}]*chipTitles/.test(trigger),
  'mất danh sách đầy đủ',
)
check(
  'U30.17 bảng: Ngày mai qua previewItems(…, AGENDA_TOMORROW_PREVIEW, tomorrowExpanded) + nút calendar.agenda.showMore; mở bảng thu về 3',
  /previewItems\([\s\S]{0,120}AGENDA_TOMORROW_PREVIEW[\s\S]{0,60}tomorrowExpanded/.test(chipScript) &&
    /t\('calendar\.agenda\.showMore', \{ n: /.test(chipTpl) && /tomorrowExpanded\.value = false/.test(chipScript),
  'Ngày mai chưa gọn 3 dòng',
)
const panelCss = (/\.agenda-chip__panel \{[^}]*\}/.exec(chip) ?? [''])[0]
check('U30.18 bảng cao hơn (min(520px, 100vh − 72px)), cuộn khi dài', /max-height: min\(520px, calc\(100vh - 72px\)\)/.test(panelCss) && /overflow-y: auto/.test(panelCss), panelCss)

console.log('\nT7 — chữ + docs')
const en = read('src', 'i18n', 'en.ts')
const vi = read('src', 'i18n', 'vi.ts')
const keys = ['calendar.cell.more', 'calendar.cell.moreTitle', 'calendar.agenda.eventCount', 'calendar.agenda.showMore']
check(
  'U30.19 i18n en + vi có 4 chuỗi mới, đều có {n}',
  keys.every((k) => new RegExp(`'${k.replace(/\./g, '\\.')}': '[^']*\\{n\\}`).test(en) && new RegExp(`'${k.replace(/\./g, '\\.')}': '[^']*\\{n\\}`).test(vi)),
  keys.filter((k) => !en.includes(`'${k}'`) || !vi.includes(`'${k}'`)).join(', ') || 'thiếu {n}',
)
const listing = read('docs', 'CHROME-STORE-LISTING.md')
const desc = read('docs', 'chrome-store-detailed-description.txt')
check(
  'U30.20 docs Store: "up to 6 events per day", hết "3 events per day"',
  /up to 6 events per day/.test(listing) && /up to 6 events per day/.test(desc) && !/3 events per day/.test(listing + desc),
  'docs còn 3',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U30-calendar-six-per-day.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U30 đúng spec.')
