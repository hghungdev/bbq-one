/**
 * FAILING TEST — C9.1: baseline optimistic lock phải là server updated_at nguyên văn.
 *
 * Chạy: node specs/C9.1-baseline-normalize.test.mjs
 *
 * Khác test C9 cũ (xanh giả): mock server ở đây là POSTGRES SIMULATOR có:
 *   - BEFORE UPDATE trigger: updated_at := serverNow() — giờ server LỆCH +137ms so với client,
 *     format PostgREST CÓ MICROSECOND ('.123456+00:00');
 *   - trigger note_bodies_touch_note: update body → bump notes.updated_at (005_note_bodies.sql:161);
 *   - RPC bbq_update_*_if_current: so sánh STRING updated_at === p_expected_updated_at,
 *     sai → error P0001 BBQ_CONFLICT (đúng semantics migration 014).
 *
 * Thực thi CODE THẬT (transpile): syncConflict.ts, notes.service.ts, noteBodies.service.ts,
 * calendarEvents.service.ts, sync.service.ts.
 *
 * RED trên code hiện tại (hotfix flag=false): W1, T1(via-RPC), T2, T4, T5, W2-W5.
 * RED trên C9 gốc (nếu chỉ bật lại flag): T1 (conflict vĩnh viễn), T2 (không stash), T3 (R2).
 * GREEN sau specs/C9.1-baseline-normalize.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

function loadTsModule(filePath, mocks) {
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

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}

// ── chrome.storage.local mock (cho stashConflictBackup) ─────────────────────
const chromeStore = new Map()
globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        const keys = Array.isArray(key) ? key : [key]
        const out = {}
        for (const k of keys) out[k] = chromeStore.get(k)
        return out
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) chromeStore.set(k, v)
      },
      async remove(key) {
        chromeStore.delete(key)
      },
    },
  },
}

// ═════════════════════════════════════════════════════════════════════════════
// POSTGRES SIMULATOR — trigger updated_at := now() (server clock) + touch note
// ═════════════════════════════════════════════════════════════════════════════
const SERVER_SKEW_MS = 137
let microTick = 123456
function serverNow() {
  // PostgREST format với microsecond: '2026-07-03T14:12:22.123456+00:00'
  microTick = (microTick + 111) % 1000000
  const iso = new Date(Date.now() + SERVER_SKEW_MS).toISOString() // '....123Z'
  return `${iso.slice(0, -1)}${String(microTick % 1000).padStart(3, '0')}+00:00`
}

const sim = {
  notes: new Map(),
  note_bodies: new Map(),
  calendar_events: new Map(),
  rpcCalls: [],
  table(name) {
    return this[name]
  },
  touchNote(noteId) {
    const n = this.notes.get(noteId)
    if (n) n.updated_at = serverNow() // note_bodies_touch_note
  },
  // update trực tiếp trên server (mô phỏng "máy B" hoặc plain .update() từ client)
  directUpdate(tableName, id, fields) {
    const row = this.table(tableName).get(id)
    if (!row) return null
    Object.assign(row, fields)
    row.updated_at = serverNow() // retronote_update_updated_at
    if (tableName === 'note_bodies') this.touchNote(row.note_id)
    return { ...row }
  },
}

function seedNote(id, title) {
  sim.notes.set(id, {
    id, user_id: 'u1', title, folder_id: null, tags: [],
    created_at: serverNow(), updated_at: serverNow(), synced_at: null, fts: null,
  })
}
function seedBody(id, noteId, content) {
  sim.note_bodies.set(id, {
    id, note_id: noteId, user_id: 'u1', label: 'L', content, position: 0,
    created_at: serverNow(), updated_at: serverNow(), synced_at: null, fts: null,
  })
}

// ── supabase mock: chainable query + rpc với guard đúng migration 014 ────────
function makeQuery(tableName) {
  const ops = []
  const q = {}
  for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'in', 'textSearch', 'update', 'insert', 'single']) {
    q[m] = (...args) => {
      ops.push([m, args])
      return q
    }
  }
  q.then = (resolve, reject) => Promise.resolve().then(() => execute(tableName, ops)).then(resolve, reject)
  return q
}

function execute(tableName, ops) {
  const table = sim.table(tableName)
  const opNames = ops.map(([m]) => m)
  const eqOp = ops.find(([m]) => m === 'eq')
  if (opNames.includes('update')) {
    const fields = ops.find(([m]) => m === 'update')[1][0]
    const id = eqOp[1][1]
    const row = sim.directUpdate(tableName, id, fields)
    if (!row) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    return { data: row, error: null }
  }
  if (opNames.includes('single')) {
    const id = eqOp[1][1]
    const row = table.get(id)
    if (!row) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    return { data: { ...row }, error: null }
  }
  // select list
  return { data: [...table.values()].map((r) => ({ ...r })), error: null }
}

const RPC_TABLE = {
  bbq_update_note_if_current: 'notes',
  bbq_update_note_body_if_current: 'note_bodies',
  bbq_update_calendar_event_if_current: 'calendar_events',
}

const supabaseSim = {
  from: (t) => makeQuery(t),
  rpc: async (name, args) => {
    sim.rpcCalls.push({ name, args })
    const tableName = RPC_TABLE[name]
    const row = sim.table(tableName).get(args.p_id)
    if (!row) return { data: null, error: { code: 'P0001', message: `BBQ_CONFLICT: ${args.p_id} missing` } }
    // migration 014: WHERE updated_at = p_expected_updated_at (so sánh timestamptz — string tại đây)
    if (row.updated_at !== args.p_expected_updated_at) {
      return { data: null, error: { code: 'P0001', message: `BBQ_CONFLICT: ${args.p_id} was updated elsewhere` } }
    }
    const fields = {}
    for (const [k, v] of Object.entries(args)) {
      if (k === 'p_id' || k === 'p_expected_updated_at') continue
      fields[k.slice(2)] = v // p_title → title
    }
    Object.assign(row, fields)
    row.updated_at = serverNow() // trigger
    if (tableName === 'note_bodies') sim.touchNote(row.note_id)
    return { data: { ...row }, error: null }
  },
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
}

// ── load CODE THẬT ────────────────────────────────────────────────────────────
const syncConflict = loadTsModule(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), {})
const authMock = { isAuthenticated: async () => true }

const noteBodiesMod = loadTsModule(path.join(ROOT, 'src', 'services', 'noteBodies.service.ts'), {
  './supabase': { supabase: supabaseSim },
  '@/services/localFirst/authMode': authMock,
  '@/services/localFirst/localNotes.service': { localNoteBodiesService: {} },
  '@/utils/syncConflict': syncConflict,
})
const notesMod = loadTsModule(path.join(ROOT, 'src', 'services', 'notes.service.ts'), {
  './supabase': { supabase: supabaseSim },
  './noteBodies.service': noteBodiesMod,
  '@/services/localFirst/authMode': authMock,
  '@/services/localFirst/localNotes.service': { localNotesService: {} },
  '@/utils/syncConflict': syncConflict,
})
const calMod = loadTsModule(path.join(ROOT, 'src', 'services', 'calendarEvents.service.ts'), {
  '@/constants/calendar': { CALENDAR_MAX_EVENTS_PER_DAY: 50 },
  './supabase': { supabase: supabaseSim },
  '@/services/localFirst/authMode': authMock,
  '@/services/localFirst/localCalendarEvents.service': { localCalendarEventsService: {} },
  '@/utils/syncConflict': syncConflict,
})
const syncMod = loadTsModule(path.join(ROOT, 'src', 'services', 'sync.service.ts'), {
  '@/constants/storage': {
    NOTES_CACHE_KEY: 'notes_cache',
    NOTE_BODIES_CACHE_KEY: 'note_bodies_cache',
    FOLDERS_CACHE_KEY: 'folders_cache',
  },
  '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
  '@/utils/secureCrypto': { encryptField: async (v) => v, isEncryptedEnvelope: () => false },
  './calendarEvents.service': calMod,
  './noteBodies.service': noteBodiesMod,
  './notes.service': notesMod,
  './localFirst/authMode': authMock,
  '@/utils/syncConflict': syncConflict, // C9.1 sẽ import (stash/neutralize); chưa import cũng vô hại
})

const { notesService } = notesMod
const { noteBodiesService } = noteBodiesMod
const { syncService } = syncMod

// timestamp local chắc chắn dirty (nếu code đã có nextLocalUpdatedAt thì dùng bản thật)
const bumpLocal = (row) =>
  typeof syncConflict.nextLocalUpdatedAt === 'function'
    ? syncConflict.nextLocalUpdatedAt(row)
    : new Date(Date.now() + 10_000).toISOString()

// ═════════════════════════════════════════════════════════════════════════════
console.log('W1 — flag')
check(
  'W1 C9_OPTIMISTIC_RPC_ENABLED === true (C9.1 bật lại optimistic lock)',
  syncConflict.C9_OPTIMISTIC_RPC_ENABLED === true,
  'flag còn false (hotfix 5a55bd8) — C9.1 chưa implement',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT1 — dirty push PHẢI thành công qua RPC (giết lỗi C9 gốc: conflict vĩnh viễn)')
seedNote('n1', 'server v1')
seedBody('b1', 'n1', 'server body v1')

const pulled1 = (await notesService.getAll()).find((n) => n.id === 'n1')
const t4SyncedAtAtPull = pulled1.synced_at // dùng cho T4
const editedOffline = { ...pulled1, title: 'edited offline', updated_at: bumpLocal(pulled1) }

sim.rpcCalls.length = 0
await syncService.syncDirtyNotesFromList([editedOffline], [], [], () => null)

check(
  'T1a server nhận offline edit (không còn BBQ_CONFLICT giả do baseline sai)',
  sim.notes.get('n1').title === 'edited offline',
  `server title = "${sim.notes.get('n1').title}" — dirty push bị conflict vĩnh viễn (baseline synced_at client-ts ≠ server updated_at trigger)`,
)
check(
  'T1b push đi qua RPC guard (không phải plain LWW của hotfix)',
  sim.rpcCalls.some((c) => c.name === 'bbq_update_note_if_current'),
  `rpcCalls = ${JSON.stringify(sim.rpcCalls.map((c) => c.name))} — đang LWW (flag off), không có optimistic lock`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — stale dirty KHÔNG được đè bản mới hơn từ máy B (server-wins + stash + neutralize)')
const pulled2 = (await notesService.getAll()).find((n) => n.id === 'n1')
const staleEdit = { ...pulled2, title: 'stale offline edit', updated_at: bumpLocal(pulled2) }
sim.directUpdate('notes', 'n1', { title: 'B newer' }) // máy B sửa SAU lần pull của client

await syncService.syncDirtyNotesFromList([staleEdit], [], [], () => null)

check(
  'T2a server giữ bản B (stale edit không LWW-đè)',
  sim.notes.get('n1').title === 'B newer',
  `server title = "${sim.notes.get('n1').title}" — hotfix LWW đè mất edit mới hơn của máy B (đúng bug C9 phải chặn)`,
)
const backups = chromeStore.get(syncConflict.BBQ_CONFLICT_BACKUPS_KEY ?? 'bbqone_conflict_backups') ?? []
check(
  'T2b bản thua được stash vào bbqone_conflict_backups (không mất im lặng)',
  Array.isArray(backups) && backups.some((b) => b?.row?.title === 'stale offline edit'),
  `backups = ${JSON.stringify(backups)} — conflict bị skip im lặng, bản local mất không dấu vết`,
)
check(
  'T2c row local được neutralize (synced_at := updated_at) để re-pull đè bằng bản server',
  staleEdit.synced_at === staleEdit.updated_at,
  `synced_at=${staleEdit.synced_at}, updated_at=${staleEdit.updated_at} — row còn dirty → ghost-dirty pin qua C1 merge-guard, máy này không bao giờ thấy bản B`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — R2: sửa body (touch bump note) rồi rename note interactive PHẢI thành công (retry-once)')
const noteBefore = (await notesService.getAll()).find((n) => n.id === 'n1')
const bodyBefore = (await noteBodiesService.getAll()).find((b) => b.id === 'b1')

let t3Error = null
try {
  await noteBodiesService.update(
    'b1',
    { content: 'body v2' },
    { row: bodyBefore, retryOnConflictWithServerState: true },
  ) // → note_bodies_touch_note bump n1.updated_at trên server
  await notesService.update(
    'n1',
    { title: 'renamed after body edit' },
    { row: noteBefore, retryOnConflictWithServerState: true }, // baseline note đã stale vì touch
  )
} catch (e) {
  t3Error = e
}
check(
  'T3 rename sau body-edit thành công (conflict do touch-trigger được retry với server state)',
  t3Error === null && sim.notes.get('n1').title === 'renamed after body edit',
  t3Error
    ? `throw ${t3Error?.name ?? ''}: ${t3Error?.message} — luồng UI thường nhật fail (R2)`
    : `server title = "${sim.notes.get('n1').title}"`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — baseline nguyên văn microsecond (không Date-round-trip)')
check(
  'T4 synced_at sau getAll = server updated_at NGUYÊN VĂN (giữ ".xxxxxx+00:00")',
  typeof t4SyncedAtAtPull === 'string' && t4SyncedAtAtPull.includes('+00:00'),
  `synced_at sau pull = ${JSON.stringify(t4SyncedAtAtPull)} — chưa normalize acceptServerRow, hoặc string bị new Date() làm tròn mất microsecond → WHERE updated_at = expected không bao giờ khớp`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT5 — hết ghost-dirty: row trả về sau UI update phải sạch')
const cleanRow = (await notesService.getAll()).find((n) => n.id === 'n1')
const updatedRes = await notesService.update(
  'n1',
  { title: 'T5 title' },
  { row: cleanRow, retryOnConflictWithServerState: true },
)
check(
  'T5 row trả về có synced_at === updated_at (isRowDirty = false, không pin qua merge-guard)',
  updatedRes && updatedRes.synced_at === updatedRes.updated_at,
  `synced_at=${JSON.stringify(updatedRes?.synced_at)}, updated_at=${JSON.stringify(updatedRes?.updated_at)} — ghost-dirty: row dirty vĩnh viễn sau mỗi update thành công`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW2-W5 — static wiring')
const readSrc = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const svcNotes = readSrc('src', 'services', 'notes.service.ts')
const svcBodies = readSrc('src', 'services', 'noteBodies.service.ts')
const svcCal = readSrc('src', 'services', 'calendarEvents.service.ts')
const syncSrc = readSrc('src', 'services', 'sync.service.ts')
const storeNotes = readSrc('src', 'stores', 'notes.ts')
const storeCal = readSrc('src', 'stores', 'calendarEvents.ts')

check(
  'W2 cả 3 service normalize bằng acceptServerRow(',
  [svcNotes, svcBodies, svcCal].every((s) => s.includes('acceptServerRow(')),
  'row từ server vào app không được chuẩn hóa synced_at := updated_at',
)
const dirtyLoop = syncSrc.slice(
  syncSrc.indexOf('async syncDirtyNotesFromList'),
  syncSrc.indexOf('syncDirtyCalendarEventsFromList'),
)
check(
  'W3 sync loop push NOTE trước BODIES (né note_bodies_touch_note trong cùng pass)',
  dirtyLoop.indexOf('notesService.update') !== -1
    && dirtyLoop.indexOf('noteBodiesService.update') !== -1
    && dirtyLoop.indexOf('notesService.update') < dirtyLoop.indexOf('noteBodiesService.update'),
  'bodies push trước → touch trigger bump note.updated_at → note push conflict ngay trong pass',
)
check(
  'W4 stores offline-fallback dùng nextLocalUpdatedAt (clock guard)',
  storeNotes.includes('nextLocalUpdatedAt(') && storeCal.includes('nextLocalUpdatedAt('),
  'client clock chậm hơn server → offline edit trông "sạch" → không bao giờ push',
)
const syncFromCacheBlock = syncSrc.slice(syncSrc.indexOf('async syncFromCache'))
check(
  'W5 syncFromCache re-pull merge (mergeFreshWithDirtyLocal) thay vì ghi đè raw',
  syncFromCacheBlock.includes('mergeFreshWithDirtyLocal('),
  're-pull đè raw cache → mất dirty row chưa push vì lỗi network (C1 trong context SW)',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C9.1-baseline-normalize.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — C9.1 baseline normalize đúng spec: optimistic lock hoạt động thật.')
