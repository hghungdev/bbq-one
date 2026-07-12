/**
 * FAILING TEST — C9.2: write-back baseline + per-body conflict + surface conflict backups.
 *
 * Chạy: node specs/C9.2-conflict-surface.test.mjs
 *
 * Postgres simulator như C9.1 (trigger updated_at := serverNow() lệch +137ms, microsecond,
 * note_bodies_touch_note, RPC guard so sánh string). Thực thi code thật: syncConflict.ts,
 * notes.service.ts, noteBodies.service.ts, sync.service.ts.
 *
 * RED trên code hiện tại (C9.1 @ dc9a1fe):
 *   T0 — REGRESSION C9.1: push thành công không write-back → pass 2 tự-conflict + stash rác
 *   T1 — body dirty dưới note sạch không được push / không recovery
 *   T2 — note conflict skip mất bodies
 *   T3/T4 — backup manager (dedupe, list/remove) chưa có
 *   W1-W3 — wiring UI chưa có
 * GREEN sau specs/C9.2-conflict-surface.spec.md.
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

// ── chrome.storage.local mock ────────────────────────────────────────────────
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
// POSTGRES SIMULATOR (như C9.1)
// ═════════════════════════════════════════════════════════════════════════════
const SERVER_SKEW_MS = 137
let microTick = 123456
function serverNow() {
  microTick = (microTick + 111) % 1000000
  const iso = new Date(Date.now() + SERVER_SKEW_MS).toISOString()
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
    if (n) n.updated_at = serverNow()
  },
  directUpdate(tableName, id, fields) {
    const row = this.table(tableName).get(id)
    if (!row) return null
    Object.assign(row, fields)
    row.updated_at = serverNow()
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
  // N2: service phân trang qua .range — sim dataset nhỏ, slice là đủ
  q.range = (from, to) => Promise.resolve().then(() => execute(tableName, ops)).then((res) => (Array.isArray(res.data) ? { ...res, data: res.data.slice(from, to + 1) } : res))
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
    if (row.updated_at !== args.p_expected_updated_at) {
      return { data: null, error: { code: 'P0001', message: `BBQ_CONFLICT: ${args.p_id} was updated elsewhere` } }
    }
    const fields = {}
    for (const [k, v] of Object.entries(args)) {
      if (k === 'p_id' || k === 'p_expected_updated_at') continue
      fields[k.slice(2)] = v
    }
    Object.assign(row, fields)
    row.updated_at = serverNow()
    if (tableName === 'note_bodies') sim.touchNote(row.note_id)
    return { data: { ...row }, error: null }
  },
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
}

// ── load CODE THẬT ────────────────────────────────────────────────────────────
const syncConflict = loadTsModule(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), { '@/utils/webLock': loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'), {}) })
const authMock = { isAuthenticated: async () => true, getCurrentUserId: async () => 'u1' }

const noteBodiesMod = loadTsModule(path.join(ROOT, 'src', 'services', 'noteBodies.service.ts'), {
  './supabase': { supabase: supabaseSim },
  '@/services/localFirst/authMode': authMock,
  '@/services/localFirst/localNotes.service': { localNoteBodiesService: {} },
  '@/utils/syncConflict': syncConflict,
  '@/utils/supabaseFetchAll': loadTsModule(path.join(ROOT, 'src', 'utils', 'supabaseFetchAll.ts'), {}),
})
const notesMod = loadTsModule(path.join(ROOT, 'src', 'services', 'notes.service.ts'), {
  './supabase': { supabase: supabaseSim },
  './noteBodies.service': noteBodiesMod,
  '@/services/localFirst/authMode': authMock,
  '@/services/localFirst/localNotes.service': { localNotesService: {} },
  '@/utils/syncConflict': syncConflict,
  '@/utils/supabaseFetchAll': loadTsModule(path.join(ROOT, 'src', 'utils', 'supabaseFetchAll.ts'), {}),
})
const calMod = loadTsModule(path.join(ROOT, 'src', 'services', 'calendarEvents.service.ts'), {
  '@/constants/calendar': { CALENDAR_MAX_EVENTS_PER_DAY: 50 },
  './supabase': { supabase: supabaseSim },
  '@/services/localFirst/authMode': authMock,
  '@/services/localFirst/localCalendarEvents.service': { localCalendarEventsService: {} },
  '@/utils/syncConflict': syncConflict,
  '@/utils/supabaseFetchAll': loadTsModule(path.join(ROOT, 'src', 'utils', 'supabaseFetchAll.ts'), {}),
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
  './localFirst/dataOwner.service': { isPushAllowedFor: async () => true },
  '@/utils/syncConflict': syncConflict,
  '@/utils/supabaseFetchAll': loadTsModule(path.join(ROOT, 'src', 'utils', 'supabaseFetchAll.ts'), {}),
})

const { notesService } = notesMod
const { noteBodiesService } = noteBodiesMod
const { syncService } = syncMod

const STASH_KEY = syncConflict.BBQ_CONFLICT_BACKUPS_KEY ?? 'bbqone_conflict_backups'
const rawStash = () => chromeStore.get(STASH_KEY) ?? []
const clearStash = () => chromeStore.delete(STASH_KEY)
const bumpLocal = (row) => syncConflict.nextLocalUpdatedAt(row)

// ═════════════════════════════════════════════════════════════════════════════
console.log('T0 — REGRESSION C9.1: push thành công phải write-back baseline (không tự-conflict pass sau)')
seedNote('nA', 'T0 server v1')
const pulledA = (await notesService.getAll()).find((n) => n.id === 'nA')
const localA = { ...pulledA, title: 'T0 edited offline', updated_at: bumpLocal(pulledA) }

await syncService.syncDirtyNotesFromList([localA], [], [], () => null) // pass 1
check(
  'T0a pass 1 push thành công + write-back: local synced_at = server updated_at NGUYÊN VĂN',
  sim.notes.get('nA').title === 'T0 edited offline'
    && localA.synced_at === sim.notes.get('nA').updated_at,
  `server title="${sim.notes.get('nA').title}", local synced_at=${JSON.stringify(localA.synced_at)}, server updated_at=${JSON.stringify(sim.notes.get('nA').updated_at)} — không write-back → row vẫn dirty với baseline cũ`,
)

sim.rpcCalls.length = 0
clearStash()
await syncService.syncDirtyNotesFromList([localA], [], [], () => null) // pass 2, không có edit mới
check(
  'T0b pass 2 KHÔNG push lại (row đã sạch — không rpc call nào)',
  sim.rpcCalls.length === 0,
  `rpcCalls = ${JSON.stringify(sim.rpcCalls.map((c) => c.name))} — row đã-push-thành-công vẫn dirty → push thừa với baseline stale`,
)
check(
  'T0c pass 2 KHÔNG sinh stash rác (tự-conflict với chính nội dung mình)',
  rawStash().length === 0,
  `stash = ${JSON.stringify(rawStash())} — mỗi offline edit đẻ 1 entry "YOUR EDITS WERE SUPERSEDED" y hệt bản live → dialog C9.2 thành noise`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT1 — body dirty dưới note SẠCH: phải được push, conflict → stash note_body + neutralize')
seedNote('nB', 'T1 note')
seedBody('bB', 'nB', 'T1 server body v1')
const pulledNB = (await notesService.getAll()).find((n) => n.id === 'nB')
const pulledBB = (await noteBodiesService.getAll()).find((b) => b.id === 'bB')
const localNB = { ...pulledNB } // note SẠCH
const localBB = { ...pulledBB, content: 'T1 my body edit', updated_at: bumpLocal(pulledBB) }
sim.directUpdate('note_bodies', 'bB', { content: 'T1 B body newer' }) // máy B sửa body sau pull

clearStash()
await syncService.syncDirtyNotesFromList([localNB], [localBB], [], () => null)

const t1Stash = rawStash()
check(
  "T1a stash có kind 'note_body' chứa đúng content bản thua",
  t1Stash.some((e) => e?.kind === 'note_body' && e?.row?.content === 'T1 my body edit'),
  `stash = ${JSON.stringify(t1Stash.map((e) => ({ kind: e?.kind, id: e?.row?.id })))} — body dirty dưới note sạch bị bỏ qua hoàn toàn (gating isNoteDirty) → pin im lặng`,
)
check(
  'T1b body local được neutralize (synced_at := updated_at) để re-pull đè bằng bản B',
  localBB.synced_at === localBB.updated_at,
  `synced_at=${JSON.stringify(localBB.synced_at)}, updated_at=${JSON.stringify(localBB.updated_at)} — body còn dirty → ghost-pin qua merge-guard`,
)
check(
  'T1c server giữ bản B (không LWW-đè)',
  sim.note_bodies.get('bB').content === 'T1 B body newer',
  `server body = "${sim.note_bodies.get('bB').content}"`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — note conflict KHÔNG được skip bodies (baseline bodies vẫn hợp lệ)')
seedNote('nC', 'T2 note v1')
seedBody('bC', 'nC', 'T2 server body v1')
const pulledNC = (await notesService.getAll()).find((n) => n.id === 'nC')
const pulledBC = (await noteBodiesService.getAll()).find((b) => b.id === 'bC')
const localNC = { ...pulledNC, title: 'T2 my note edit', updated_at: bumpLocal(pulledNC) }
const localBC = { ...pulledBC, content: 'T2 my body edit', updated_at: bumpLocal(pulledBC) }
sim.directUpdate('notes', 'nC', { title: 'T2 B note newer' }) // máy B sửa NOTE (không đụng body)

clearStash()
await syncService.syncDirtyNotesFromList([localNC], [localBC], [], () => null)

check(
  'T2a body vẫn được push thành công dù note conflict',
  sim.note_bodies.get('bC').content === 'T2 my body edit',
  `server body = "${sim.note_bodies.get('bC').content}" — note conflict kéo chết cả bodies dù baseline bodies hợp lệ`,
)
check(
  "T2b note thua được stash kind 'note' (server giữ bản B)",
  rawStash().some((e) => e?.kind === 'note' && e?.row?.title === 'T2 my note edit')
    && sim.notes.get('nC').title === 'T2 B note newer',
  `stash = ${JSON.stringify(rawStash().map((e) => e?.kind))}, server note = "${sim.notes.get('nC').title}"`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3+T4 — backup manager: dedupe, id, list/remove')
const hasManager =
  typeof syncConflict.listConflictBackups === 'function'
  && typeof syncConflict.removeConflictBackup === 'function'
check(
  'T4a syncConflict.ts export listConflictBackups + removeConflictBackup',
  hasManager,
  'chưa có API đọc/xóa backup — UI không thể surface',
)
if (hasManager) {
  clearStash()
  await syncConflict.stashConflictBackup('note', { id: 'dup', title: 'v1' })
  await syncConflict.stashConflictBackup('note', { id: 'dup', title: 'v2' })
  const deduped = await syncConflict.listConflictBackups()
  check(
    'T3 dedupe theo (kind, row.id): 2 lần stash cùng row → 1 entry, giữ bản mới nhất',
    deduped.length === 1 && deduped[0].row.title === 'v2' && typeof deduped[0].id === 'string',
    `list = ${JSON.stringify(deduped)}`,
  )

  clearStash()
  chromeStore.set(STASH_KEY, [
    { kind: 'note', row: { id: 'leg1', title: 'legacy C9.1 entry' }, at: '2026-07-03T00:00:00Z' },
  ])
  const legacy = await syncConflict.listConflictBackups()
  const legId = legacy[0]?.id
  check(
    'T4b entry legacy C9.1 (không id) được derive id ổn định',
    legacy.length === 1 && typeof legId === 'string' && legId.length > 0,
    `legacy = ${JSON.stringify(legacy)}`,
  )
  await syncConflict.removeConflictBackup(legId)
  check(
    'T4c removeConflictBackup(id) xóa đúng entry',
    (await syncConflict.listConflictBackups()).length === 0,
    'entry không xóa được — Discard trong dialog sẽ không hoạt động',
  )
} else {
  console.log('  (bỏ qua T3/T4b/T4c — chưa có API)')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW1-W3 — static wiring UI')
const syncSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'sync.service.ts'), 'utf8')
check(
  "W1 sync.service có per-body recovery: stashConflictBackup('note_body'",
  syncSrc.includes("stashConflictBackup('note_body'"),
  'body conflict vẫn bị catch ở tầng note',
)
const dialogPath = path.join(ROOT, 'src', 'components', 'sync', 'ConflictBackupsDialog.vue')
const dialogSrc = fs.existsSync(dialogPath) ? fs.readFileSync(dialogPath, 'utf8') : ''
check(
  'W2 ConflictBackupsDialog.vue tồn tại với emit restore/dismiss',
  dialogSrc.includes('restore') && dialogSrc.includes('dismiss'),
  'chưa có component surface backups',
)
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
check(
  'W3 pages/App.vue wire listConflictBackups + ConflictBackupsDialog',
  appSrc.includes('listConflictBackups') && appSrc.includes('ConflictBackupsDialog'),
  'backups ghi vào storage nhưng không bao giờ hiện cho user',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C9.2-conflict-surface.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — C9.2 đúng spec: baseline write-back, per-body recovery, backups có UI.')
