/**
 * FAILING TEST — N2: PostgREST cap 1.000 rows → dữ liệu "biến mất" khỏi app khi >1.000 rows.
 *
 * Chạy:   node specs/N2-pull-pagination.test.mjs
 *
 * Test transpile và THỰC THI CODE THẬT của 4 service (notes / noteBodies / calendarEvents /
 * folders), mock supabase client mô phỏng ĐÚNG hành vi Supabase hosted: mọi response trả
 * tối đa 1.000 rows (db-max-rows), .range(from, to) slice theo offset nhưng vẫn cap 1.000.
 *
 * RED trên code hiện tại: T1–T4 fail (getAll trả đúng 1.000 rows, phần còn lại im lặng mất),
 * T5 fail (src/utils/supabaseFetchAll.ts chưa tồn tại).
 * GREEN sau khi áp specs/N2-pull-pagination.spec.md.
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

// ── mock supabase: PostgREST hosted cap 1.000 rows MỌI response ─────────────
const PG_MAX_ROWS = 1000
let pageFetches = 0
function makeBuilder(rows, tableName) {
  const b = {
    select: () => b,
    order: () => b,
    eq: () => b,
    gte: () => b,
    lte: () => b,
    range(from, to) {
      pageFetches++
      const want = rows.slice(from, to + 1)
      // server cap từng response — .range(0, 999999) vẫn chỉ nhận 1.000 rows
      return Promise.resolve({ data: want.slice(0, PG_MAX_ROWS), error: null })
    },
    then(resolve, reject) {
      // await builder trực tiếp (code hiện tại) = 1 request không range → cap 1.000
      pageFetches++
      return Promise.resolve({ data: rows.slice(0, PG_MAX_ROWS), error: null }).then(
        resolve,
        reject,
      )
    },
  }
  void tableName
  return b
}

// ── seed data deterministic ──────────────────────────────────────────────────
const pad = (n, w) => String(n).padStart(w, '0')

// 2.500 notes, order updated_at desc (server-side order mô phỏng bằng thứ tự mảng)
const NOTES = Array.from({ length: 2500 }, (_, i) => ({
  id: `note-${pad(i, 5)}`,
  title: `Note ${i}`,
  updated_at: `2026-07-01T00:00:${pad(2500 - i, 2)}Z`,
}))

// 5.000 bodies, server order note_id asc — note "mới nhất" cố tình mang UUID lớn nhất
const NEWEST_NOTE_ID = 'zzzz-newest-note'
const BODIES = [
  ...Array.from({ length: 4999 }, (_, i) => ({
    id: `body-${pad(i, 5)}`,
    note_id: `note-${pad(Math.floor(i / 2), 5)}`,
    position: i % 2,
    content: `<p>body ${i}</p>`,
  })),
  { id: 'body-zzzzz', note_id: NEWEST_NOTE_ID, position: 0, content: '<p>bản mới nhất</p>' },
]

// 1.100 calendar events (3 năm, order event_date asc) — event cuối là "tháng hiện tại"
const EVENTS = Array.from({ length: 1100 }, (_, i) => {
  const d = new Date(Date.UTC(2023, 6, 1))
  d.setUTCDate(d.getUTCDate() + i)
  return {
    id: `ev-${pad(i, 4)}`,
    title: `Event ${i}`,
    event_date: d.toISOString().slice(0, 10),
    position: 0,
  }
})
const CURRENT_MONTH_EVENT = EVENTS[EVENTS.length - 1]

// 1.500 folders
const FOLDERS = Array.from({ length: 1500 }, (_, i) => ({
  id: `folder-${pad(i, 4)}`,
  name: `Folder ${i}`,
  updated_at: `2026-07-01T00:00:00Z`,
  created_at: `2026-07-01T00:00:00Z`,
}))

const tables = {
  notes: NOTES,
  note_bodies: BODIES,
  calendar_events: EVENTS,
  folders: FOLDERS,
}
const supabaseMock = {
  from: (t) => makeBuilder(tables[t], t),
  auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
}

// ── mock chung cho các import của service ───────────────────────────────────
const syncConflictMock = {
  acceptServerRow: (r) => r,
  isSyncConflictError: () => false,
  resolveExpectedServerUpdatedAt: () => null,
  throwIfSyncConflict: () => {},
}
const authModeMock = { isAuthenticated: async () => true }
const localStubs = {
  localNotesService: {},
  localNoteBodiesService: {},
  localFoldersService: {},
  localCalendarEventsService: {},
}

// helper thật (sau fix) — nếu đã tồn tại thì service dùng bản thật
let fetchAllMod = null
try {
  fetchAllMod = loadTsModule(path.join(ROOT, 'src', 'utils', 'supabaseFetchAll.ts'))
} catch {
  /* chưa có — code hiện tại không import nó nên vẫn load service được */
}

const commonMocks = {
  './supabase': { supabase: supabaseMock },
  '@/services/localFirst/authMode': authModeMock,
  '@/utils/syncConflict': syncConflictMock,
  '@/services/localFirst/localNotes.service': localStubs,
  '@/services/localFirst/localCalendarEvents.service': localStubs,
  '@/constants/calendar': { CALENDAR_MAX_EVENTS_PER_DAY: 10 },
  '@/utils/secureCrypto': { DEFAULT_PBKDF2_ITERATIONS: 210_000 },
}
if (fetchAllMod) commonMocks['@/utils/supabaseFetchAll'] = fetchAllMod

function loadService(rel, extraMocks = {}) {
  return loadTsModule(path.join(ROOT, 'src', 'services', rel), {
    ...commonMocks,
    ...extraMocks,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — notesService.getAll(): 2.500 notes trên server phải về đủ 2.500')
pageFetches = 0
const t0 = Date.now()
const { notesService } = loadService('notes.service.ts', {
  './noteBodies.service': { noteBodiesService: {} },
})
const gotNotes = await notesService.getAll()
console.log(`  t=${Date.now() - t0}ms  server có ${NOTES.length} notes → getAll trả ${gotNotes.length} (${pageFetches} request)`)
check(
  'T1 đủ 2.500 notes',
  gotNotes.length === NOTES.length,
  `chỉ nhận ${gotNotes.length}/${NOTES.length} — ${NOTES.length - gotNotes.length} note CŨ NHẤT ` +
    'biến mất khỏi list sau loadAll (merge-guard C1 drop row sạch ngoài fresh, cache bị persist đè)',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — noteBodiesService.getAll(): 5.000 bodies + body của note MỚI NHẤT phải có mặt')
pageFetches = 0
const { noteBodiesService } = loadService('noteBodies.service.ts')
const gotBodies = await noteBodiesService.getAll()
console.log(`  server có ${BODIES.length} bodies → getAll trả ${gotBodies.length} (${pageFetches} request)`)
check(
  'T2.1 đủ 5.000 bodies',
  gotBodies.length === BODIES.length,
  `chỉ nhận ${gotBodies.length}/${BODIES.length}`,
)
check(
  'T2.2 body của note mới nhất có mặt',
  gotBodies.some((b) => b.note_id === NEWEST_NOTE_ID),
  `order note_id asc + cap 1.000 → body của note UUID lớn bị cắt — note vừa sửa MỞ RA EDITOR RỖNG ` +
    'dù content còn nguyên trên server',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — calendarEventsService.getAll(): event THÁNG HIỆN TẠI phải có mặt (1.100 events / 3 năm)')
pageFetches = 0
const { calendarEventsService } = loadService('calendarEvents.service.ts')
const gotEvents = await calendarEventsService.getAll()
console.log(`  server có ${EVENTS.length} events → getAll trả ${gotEvents.length} (${pageFetches} request)`)
check(
  'T3 event mới nhất (tháng hiện tại) có mặt',
  gotEvents.some((e) => e.id === CURRENT_MONTH_EVENT.id),
  `order event_date asc + cap 1.000 → giữ 1.000 event CŨ NHẤT, event ${CURRENT_MONTH_EVENT.event_date} ` +
    'bị cắt — THÁNG HIỆN TẠI TRỐNG TRƠN sau pull',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — foldersService.getAll(): 1.500 folders về đủ')
pageFetches = 0
const { foldersService } = loadService('folders.service.ts')
const gotFolders = await foldersService.getAll()
console.log(`  server có ${FOLDERS.length} folders → getAll trả ${gotFolders.length} (${pageFetches} request)`)
check('T4 đủ 1.500 folders', gotFolders.length === FOLDERS.length, `chỉ nhận ${gotFolders.length}/${FOLDERS.length}`)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT5 — fetchAllRows (CODE THẬT src/utils/supabaseFetchAll.ts): lỗi giữa trang phải THROW')
if (!fetchAllMod) {
  check('T5.0 src/utils/supabaseFetchAll.ts tồn tại', false, 'file chưa có — chưa có helper phân trang')
} else {
  const { fetchAllRows, SUPABASE_PAGE_SIZE } = fetchAllMod
  check(
    'T5.0 export fetchAllRows + SUPABASE_PAGE_SIZE=1000',
    typeof fetchAllRows === 'function' && SUPABASE_PAGE_SIZE === 1000,
    `fetchAllRows=${typeof fetchAllRows}, SUPABASE_PAGE_SIZE=${SUPABASE_PAGE_SIZE}`,
  )
  // trang 1 OK (1.000 rows), trang 2 lỗi → PHẢI throw, không trả mảng cắt cụt
  let calls = 0
  let threw = false
  try {
    await fetchAllRows(() => ({
      range(from, to) {
        calls++
        if (from === 0) {
          return Promise.resolve({
            data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: i })).slice(0, 1000),
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: new Error('network mid-page') })
      },
    }))
  } catch {
    threw = true
  }
  check(
    'T5.1 lỗi trang 2 → throw (không trả mảng cắt cụt)',
    threw,
    'mảng cắt cụt sẽ bị merge-guard hiểu là "server đã xóa" → mất data — phải throw để loadAll fallback cache',
  )
  check('T5.2 builder MỚI mỗi trang (makeQuery được gọi ≥ 2 lần)', calls >= 2, `calls=${calls}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/N2-pull-pagination.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix N2 đúng spec.')
