/**
 * FAILING TEST — U1 (bỏ icon đồng hồ header) + U2 (ô tìm kiếm Calendar thu vào nút kính lúp).
 *
 * Chạy:   node specs/U1-U2-header-clock-calendar-search.test.mjs
 *
 * RED trên 474e569:
 *   - U1 fail: header còn nút đồng hồ + setInterval 1 s.
 *   - U2 fail: tab Calendar còn SearchBar toàn chiều ngang; chưa có CalendarInlineSearch / slot /
 *              requestSearchFocus.
 * GREEN sau khi áp specs/U1-U2-header-clock-calendar-search.spec.md.
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
const appSrc = read('src', 'pages', 'App.vue')
const settingsSrc = read('src', 'components', 'layout', 'SettingsModal.vue')
const viSrc = read('src', 'i18n', 'vi.ts')
const enSrc = read('src', 'i18n', 'en.ts')

// ═════════════════════════════════════════════════════════════════════════════
console.log('U1 — bỏ icon đồng hồ trên header')

check(
  'U1.1 header không còn nút đồng hồ',
  !appSrc.includes('shell__clock-btn') && !appSrc.includes('headerClockAria'),
  'còn IconButton .shell__clock-btn',
)
check(
  'U1.2 không còn timer 1 s cập nhật đồng hồ',
  !appSrc.includes('tickHeaderClock') && !appSrc.includes('headerClockTimer'),
  'setInterval(tickHeaderClock, 1000) vẫn chạy suốt đời popup',
)
check(
  'U1.3 Settings vẫn giữ mục Múi giờ (nơi chỉnh UTC offset)',
  settingsSrc.includes("t('settings.timezone')") && settingsSrc.includes('onUtcOffsetChange'),
  'mất chỗ chỉnh múi giờ',
)
check(
  'U1.4 i18n app.aria.clock đã gỡ (không còn ai dùng)',
  !viSrc.includes("'app.aria.clock'") && !enSrc.includes("'app.aria.clock'"),
  'khóa i18n mồ côi',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nU2 — Calendar: ô tìm kiếm thu vào nút kính lúp')

// U5 (đổi có chủ đích — specs/U4-U6-…spec.md): header bỏ SearchBar ở MỌI tab (chặt hơn bản cũ).
check(
  'U2.1 App.vue: SearchBar header KHÔNG render ở tab Calendar',
  !/<SearchBar/.test(appSrc),
  'tab Calendar vẫn có ô search toàn chiều ngang',
)
const keydownStart = appSrc.indexOf("e.key.toLowerCase() === 'f'")
const keydownBlock = keydownStart === -1 ? '' : appSrc.slice(keydownStart, keydownStart + 400)
check(
  'U2.2 Ctrl+F ở tab Calendar → calendarEvents.requestSearchFocus()',
  keydownBlock.includes('requestSearchFocus()'),
  keydownBlock.replace(/\s+/g, ' ').slice(0, 160),
)

// U5 (đổi có chủ đích): debounce / Esc / mở sẵn chuyển vào ui/InlineSearch.vue dùng chung —
// đọc wrapper Calendar CÙNG component chung.
const calInlineSrc = read('src', 'components', 'calendar', 'CalendarInlineSearch.vue')
const sharedInlineSrc = read('src', 'components', 'ui', 'InlineSearch.vue')
const inlineSrc = calInlineSrc === null ? null : calInlineSrc + '\n' + (sharedInlineSrc ?? '')
check(
  'U2.3 CalendarInlineSearch.vue: mặc định nút 🔍, mở → ô nhập debounce → setSearchQuery',
  inlineSrc !== null &&
    inlineSrc.includes('setSearchQuery(') &&
    inlineSrc.includes('setTimeout(') &&
    inlineSrc.includes("t('calendar.search.open')"),
  inlineSrc === null ? 'file chưa tồn tại' : 'thiếu debounce / nút mở',
)
check(
  'U2.4 đóng (✕ / Esc) = xóa query + thu gọn; còn query thì mở sẵn',
  inlineSrc !== null &&
    inlineSrc.includes('clearCalendarSearch()') &&
    inlineSrc.includes("'Escape'") &&
    /ref\(\s*(store\.searchQuery|props\.query)\.trim\(\)\.length > 0\s*\)/.test(inlineSrc),
  'thiếu nhánh đóng / mở sẵn',
)
check(
  'U2.5 CalendarInlineSearch nghe searchFocusRequest (Ctrl+F)',
  inlineSrc !== null && inlineSrc.includes('store.searchFocusRequest'),
  'Ctrl+F không mở được ô tìm kiếm',
)

const navSrc = read('src', 'components', 'calendar', 'CalendarMonthNav.vue')
const tabSrc = read('src', 'components', 'calendar', 'CalendarTab.vue')
check(
  'U2.6 CalendarMonthNav có slot "actions" cạnh nút Hôm nay; CalendarTab đặt CalendarInlineSearch vào',
  navSrc.includes('<slot name="actions"') &&
    /<template #actions>\s*<CalendarInlineSearch/.test(tabSrc),
  'ô tìm kiếm chưa nằm trong hàng điều hướng tháng',
)
const missing = ['calendar.search.open', 'calendar.search.close'].filter(
  (k) => !viSrc.includes(`'${k}'`) || !enSrc.includes(`'${k}'`),
)
check('U2.7 i18n vi + en', missing.length === 0, `thiếu: ${JSON.stringify(missing)}`)

// Hành vi store (CODE THẬT): requestSearchFocus chỉ kích UI, không đụng query.
const vueMock = {
  ref: (v) => ({ value: v }),
  computed: (fn) => ({
    get value() {
      return fn()
    },
  }),
}
let store = null
try {
  store = loadTsModule(path.join(ROOT, 'src', 'stores', 'calendarEvents.ts'), {
    pinia: { defineStore: (_n, setup) => setup },
    vue: vueMock,
    '@/constants/calendar': loadTsModule(path.join(ROOT, 'src', 'constants', 'calendar.ts')),
    '@/services/calendarEvents.service': { calendarEventsService: {} },
    '@/services/localFirst/localCalendarEvents.service': { localCalendarEventsService: {} },
    '@/utils/calendarDate': loadTsModule(path.join(ROOT, 'src', 'utils', 'calendarDate.ts')),
    '@/utils/calendarRecurrence': { recurrenceDates: () => [] },
    '@/utils/withTimeout': { withTimeout: (p) => p },
    '@/services/networkReachability.service': { isOnline: () => true },
    '@/utils/networkErrors': { isNetworkError: () => false },
    '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => '' },
    '@/services/autoSync.service': { scheduleAutoSync: () => {} },
    '@/services/sync.service': {
      isCalendarEventDirty: () => false,
      mergeFreshWithDirtyLocal: (f) => f,
      mergeSnapshotWithStored: (s) => s,
    },
    '@/stores/undoToast': { useUndoToastStore: () => ({}) },
    '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
    '@/utils/cacheWrite': { safeCacheWrite: async () => {} },
  }).useCalendarEventsStore()
} catch (e) {
  check('U2.8 store load được', false, e.message)
}
if (store) {
  const before = store.searchFocusRequest?.value
  store.setSearchQuery('họp')
  if (typeof store.requestSearchFocus === 'function') store.requestSearchFocus()
  check(
    'U2.8 store.requestSearchFocus() tăng searchFocusRequest, giữ nguyên query',
    typeof before === 'number' && store.searchFocusRequest.value === before + 1 && store.searchQuery.value === 'họp',
    `before=${before} after=${store.searchFocusRequest?.value} q=${store.searchQuery.value}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U1-U2-header-clock-calendar-search.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U1 + U2 đúng spec.')
