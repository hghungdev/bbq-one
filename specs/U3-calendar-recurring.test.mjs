/**
 * FAILING TEST — U3: sự kiện lặp lại (tuần / tháng / năm).
 *
 * Chạy:   node specs/U3-calendar-recurring.test.mjs
 *
 * RED trên 23ebf85:
 *   - T1 fail: src/utils/calendarRecurrence.ts chưa tồn tại.
 *   - T2 fail: store chưa có createRecurringEvents.
 *   - W  fail: modal tạo sự kiện chưa có "Lặp lại" / "Số lần" / xem trước; i18n thiếu.
 * GREEN sau khi áp specs/U3-calendar-recurring.spec.md.
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

const calendarDate = loadTsModule(path.join(ROOT, 'src', 'utils', 'calendarDate.ts'), {})
const calendarConst = loadTsModule(path.join(ROOT, 'src', 'constants', 'calendar.ts'), {})

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — utils/calendarRecurrence.ts: ngày của từng lần lặp (CODE THẬT)')

let R = null
try {
  R = loadTsModule(path.join(ROOT, 'src', 'utils', 'calendarRecurrence.ts'), {
    '@/utils/calendarDate': calendarDate,
  })
  check('T1.0 file tồn tại + export recurrenceDates', typeof R.recurrenceDates === 'function', 'thiếu export')
} catch (e) {
  check('T1.0 file src/utils/calendarRecurrence.ts tồn tại và load được', false, e.message)
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
if (R?.recurrenceDates) {
  const cases = [
    ['T1.1 hằng tuần ×4', ['2026-10-30', 'weekly', 4], ['2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20']],
    ['T1.2 hằng tuần qua năm mới', ['2026-12-25', 'weekly', 3], ['2026-12-25', '2027-01-01', '2027-01-08']],
    ['T1.3 hằng tháng từ 31/1: tháng thiếu ngày → ngày cuối, KHÔNG trôi về 28', ['2026-01-31', 'monthly', 5], ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']],
    ['T1.4 hằng tháng năm nhuận: 31/1 → 29/2', ['2028-01-31', 'monthly', 2], ['2028-01-31', '2028-02-29']],
    ['T1.5 hằng tháng qua năm mới', ['2026-11-15', 'monthly', 3], ['2026-11-15', '2026-12-15', '2027-01-15']],
    ['T1.6 hằng năm từ 29/2 → 28/2 ở năm không nhuận', ['2028-02-29', 'yearly', 3], ['2028-02-29', '2029-02-28', '2030-02-28']],
    ['T1.7 hằng năm ngày thường', ['2026-10-30', 'yearly', 2], ['2026-10-30', '2027-10-30']],
    ['T1.8 không lặp → chỉ ngày gốc', ['2026-10-30', 'none', 5], ['2026-10-30']],
  ]
  for (const [name, args, want] of cases) {
    const got = R.recurrenceDates(...args)
    check(name, eq(got, want), `got=${JSON.stringify(got)}`)
  }
  check(
    'T1.9 số lần bị chặn trong [1, tối đa] (tuần tối đa 52)',
    R.recurrenceDates('2026-10-30', 'weekly', 999).length === R.RECURRENCE_MAX_COUNT?.weekly &&
      R.RECURRENCE_MAX_COUNT.weekly === 52 &&
      R.recurrenceDates('2026-10-30', 'weekly', 0).length === 1,
    `999→${R.recurrenceDates('2026-10-30', 'weekly', 999).length} 0→${R.recurrenceDates('2026-10-30', 'weekly', 0).length}`,
  )
  check(
    'T1.10 mặc định tuần 4 · tháng 6 · năm 3',
    eq(R.RECURRENCE_DEFAULT_COUNT, { weekly: 4, monthly: 6, yearly: 3 }),
    JSON.stringify(R.RECURRENCE_DEFAULT_COUNT),
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — stores/calendarEvents.ts createRecurringEvents (CODE THẬT)')

const disk = new Map()
globalThis.chrome = {
  storage: {
    local: {
      get: async (k) => {
        const out = {}
        for (const key of Array.isArray(k) ? k : [k]) if (disk.has(key)) out[key] = structuredClone(disk.get(key))
        return out
      },
      set: async (obj) => {
        for (const [key, v] of Object.entries(obj)) disk.set(key, structuredClone(v))
      },
    },
  },
}

const vueMock = {
  ref: (v) => ({ value: v }),
  computed: (fn) => ({
    get value() {
      return fn()
    },
  }),
}
const piniaMock = { defineStore: (_name, setup) => setup }
const createdCalls = []
let idSeq = 0
const serviceMock = {
  calendarEventsService: {
    create: async (input) => {
      createdCalls.push(input)
      idSeq++
      return {
        id: `ev-${idSeq}`,
        user_id: 'u1',
        is_done: false,
        color: null,
        start_time: null,
        end_time: null,
        created_at: '2026-10-27T00:00:00Z',
        updated_at: '2026-10-27T00:00:00Z',
        synced_at: '2026-10-27T00:00:00Z',
        ...input,
      }
    },
  },
}

let Store = null
try {
  Store = loadTsModule(path.join(ROOT, 'src', 'stores', 'calendarEvents.ts'), {
    pinia: piniaMock,
    vue: vueMock,
    '@/constants/calendar': calendarConst,
    '@/services/calendarEvents.service': serviceMock,
    '@/services/localFirst/localCalendarEvents.service': { localCalendarEventsService: {} },
    '@/utils/calendarDate': calendarDate,
    '@/utils/calendarRecurrence': R ?? {},
    '@/utils/withTimeout': { withTimeout: (p) => p },
    '@/services/networkReachability.service': { isOnline: () => true },
    '@/utils/networkErrors': { isNetworkError: () => false },
    '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => '2026-10-27T00:00:01Z' },
    '@/services/autoSync.service': { scheduleAutoSync: () => {} },
    '@/services/sync.service': {
      isCalendarEventDirty: () => false,
      mergeFreshWithDirtyLocal: (fresh) => fresh,
      mergeSnapshotWithStored: (snap) => snap,
    },
    '@/stores/undoToast': { useUndoToastStore: () => ({ schedule: async () => {} }) },
    '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
    '@/utils/cacheWrite': {
      safeCacheWrite: async (obj) => {
        for (const [key, v] of Object.entries(obj)) disk.set(key, structuredClone(v))
      },
      // C11: store đọc cache qua readCachedArray (mock chỉ vá API mới, dùng code thật).
      readCachedArray: loadTsModule(path.join(ROOT, 'src', 'utils', 'cacheWrite.ts')).readCachedArray,
    },
    '@/utils/rowsEqual': loadTsModule(path.join(ROOT, 'src', 'utils', 'rowsEqual.ts')), // P5: import mới
  }).useCalendarEventsStore
} catch (e) {
  check('T2.0 store load được', false, e.message)
}

if (Store) {
  const s = Store()
  check('T2.0 store export createRecurringEvents', typeof s.createRecurringEvents === 'function', `typeof=${typeof s.createRecurringEvents}`)
  if (typeof s.createRecurringEvents === 'function') {
    // 06/11 đã đủ 3 sự kiện
    s.events.value = [0, 1, 2].map((p) => ({
      id: `full-${p}`,
      user_id: 'u1',
      event_date: '2026-11-06',
      title: `có sẵn ${p}`,
      description: '',
      is_done: false,
      position: p,
      color: null,
      start_time: null,
      end_time: null,
      created_at: '',
      updated_at: '',
      synced_at: '',
    }))
    const out = await s.createRecurringEvents(
      { event_date: '2026-10-30', title: 'Họp tuần', description: '' },
      { freq: 'weekly', count: 4 },
    )
    const createdDates = (out?.created ?? []).map((e) => e.event_date)
    check(
      'T2.1 hằng tuần ×4: tạo 3 ngày còn chỗ, bỏ qua 06/11 (đã đủ 3)',
      eq(createdDates, ['2026-10-30', '2026-11-13', '2026-11-20']) && eq(out?.skipped, ['2026-11-06']),
      `created=${JSON.stringify(createdDates)} skipped=${JSON.stringify(out?.skipped)}`,
    )
    check(
      'T2.2 mỗi lần lặp là một sự kiện thường cùng tiêu đề (đi qua createEvent)',
      createdCalls.length === 3 && createdCalls.every((c) => c.title === 'Họp tuần' && c.position === 0),
      JSON.stringify(createdCalls),
    )
    check(
      'T2.3 sự kiện đã có của ngày đầy không bị đụng',
      s.events.value.filter((e) => e.event_date === '2026-11-06').length === 3,
      `06/11 có ${s.events.value.filter((e) => e.event_date === '2026-11-06').length}`,
    )

    createdCalls.length = 0
    const single = await s.createRecurringEvents(
      { event_date: '2026-12-01', title: 'Một lần', description: '' },
      { freq: 'none', count: 10 },
    )
    check(
      'T2.4 "không lặp" → đúng 1 sự kiện',
      createdCalls.length === 1 && single?.created?.length === 1 && single.skipped.length === 0,
      `calls=${createdCalls.length}`,
    )
  }
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring: modal + i18n')

const modalSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'calendar', 'CalendarEventModal.vue'), 'utf8')
const viSrc = fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'vi.ts'), 'utf8')
const enSrc = fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'en.ts'), 'utf8')

check(
  'W1 modal có chọn "Lặp lại" (none/weekly/monthly/yearly) + "Số lần"',
  modalSrc.includes("'weekly'") &&
    modalSrc.includes("'monthly'") &&
    modalSrc.includes("'yearly'") &&
    modalSrc.includes('repeatCount'),
  'thiếu control lặp lại',
)
check(
  'W2 modal xem trước bằng recurrenceDates + lưu bằng createRecurringEvents',
  modalSrc.includes('recurrenceDates(') && modalSrc.includes('createRecurringEvents('),
  'thiếu xem trước / chưa gọi store',
)
check(
  'W3 tùy chọn lặp chỉ hiện khi TẠO mới (sửa = chỉ lần đó)',
  /v-if="isCreating"[^>]*>[\s\S]{0,400}calendar\.modal\.field\.repeat/.test(modalSrc),
  'chế độ sửa cũng hiện "Lặp lại"',
)
const keys = [
  'calendar.modal.field.repeat',
  'calendar.repeat.none',
  'calendar.repeat.weekly',
  'calendar.repeat.monthly',
  'calendar.repeat.yearly',
  'calendar.repeat.count',
  'calendar.repeat.preview',
  'calendar.repeat.previewSkip',
  'calendar.repeat.resultSkipped',
]
const missing = keys.filter((k) => !viSrc.includes(`'${k}'`) || !enSrc.includes(`'${k}'`))
check('W4 i18n vi + en đủ khóa lặp lại', missing.length === 0, `thiếu: ${JSON.stringify(missing)}`)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U3-calendar-recurring.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U3 đúng spec.')
