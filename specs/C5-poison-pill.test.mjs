/**
 * FAILING TEST — C5: poison-pill trong syncDirtyNotesFromList chặn các note dirty phía sau.
 *
 * Chạy:   node specs/C5-poison-pill.test.mjs
 * Smoke:  node specs/C5-poison-pill.test.mjs <path-to-alt-sync.service.ts>
 *
 * Test transpile và THỰC THI CODE THẬT của src/services/sync.service.ts (mock service imports).
 *
 * RED trên code hiện tại: P1 fail (note thứ 2 không được push vì throw từ note đã xóa trên server).
 * GREEN sau khi áp specs/C5-poison-pill.spec.md (try/catch per-note giống calendar loop).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

const SYNC_SERVICE_PATH =
  process.argv[2] ?? path.join(ROOT, 'src', 'services', 'sync.service.ts')

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

const synced = '2026-01-01T00:00:00.000Z'
const dirtyTs = '2026-01-02T00:00:00.000Z'

function makeNote(id, title) {
  return {
    id,
    title,
    folder_id: null,
    tags: [],
    updated_at: dirtyTs,
    synced_at: synced,
  }
}

function loadSyncWithMocks(notesServiceMock, noteBodiesServiceMock = { update: async () => ({}) }) {
  const syncConflictReal = loadTsModule(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), { '@/utils/webLock': loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'), {}) })
  return loadTsModule(SYNC_SERVICE_PATH, {
    '@/constants/storage': {
      NOTES_CACHE_KEY: 'notes_cache',
      NOTE_BODIES_CACHE_KEY: 'note_bodies_cache',
      FOLDERS_CACHE_KEY: 'folders_cache',
    },
    '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
    '@/utils/secureCrypto': { encryptField: async (v) => v, isEncryptedEnvelope: () => false },
    '@/utils/syncConflict': syncConflictReal,
    './calendarEvents.service': { calendarEventsService: {} },
    './noteBodies.service': { noteBodiesService: noteBodiesServiceMock },
    './notes.service': { notesService: notesServiceMock },
    './localFirst/authMode': { isAuthenticated: async () => true, getCurrentUserId: async () => 'u1' },
    './localFirst/dataOwner.service': { isPushAllowedFor: async () => true },
  })
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('CASE P1 — poison-pill: note đã xóa trên server KHÔNG được chặn note dirty phía sau')
const noteUpdates = []
const poisonNotesService = {
  update: async (id) => {
    noteUpdates.push(id)
    if (id === 'n-poison') throw new Error('PGRST116: row not found')
    return makeNote(id, 'ok')
  },
}
const syncP1 = loadSyncWithMocks(poisonNotesService)
let countP1 = -1
let threwP1 = false
try {
  countP1 = await syncP1.syncService.syncDirtyNotesFromList(
    [makeNote('n-poison', 'gone on server'), makeNote('n-good', 'valid offline edit')],
    [],
    [],
    () => null,
  )
} catch {
  threwP1 = true
}
check(
  'P1.1 syncDirtyNotesFromList KHÔNG throw — loop tiếp tục sau poison',
  !threwP1,
  'throw thoát khỏi for-loop → các note dirty phía sau không được thử push',
)
check(
  'P1.2 notesService.update được gọi cho CẢ poison lẫn note phía sau',
  noteUpdates.includes('n-poison') && noteUpdates.includes('n-good'),
  `update calls = ${JSON.stringify(noteUpdates)} — loop dừng sớm tại poison-pill`,
)
check(
  'P1.3 return count = 1 (chỉ note thành công)',
  countP1 === 1,
  `count = ${countP1} — note hợp lệ phía sau không được push`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nCASE P2 — body update throw trên note poison: note phía sau vẫn push')
const noteUpdatesP2 = []
const bodyUpdatesP2 = []
const syncP2 = loadSyncWithMocks(
  {
    update: async (id) => {
      noteUpdatesP2.push(id)
      return makeNote(id, 'ok')
    },
  },
  {
    update: async (id, _updates) => {
      bodyUpdatesP2.push(id)
      if (id === 'body-poison') throw new Error('body row not found')
      return { id }
    },
  },
)
const notePoison = makeNote('n-poison-body', 'has bad body')
const bodyPoison = {
  id: 'body-poison',
  note_id: 'n-poison-body',
  label: 'x',
  content: 'y',
  position: 0,
  updated_at: dirtyTs,
  synced_at: synced,
}
const countP2 = await (async () => {
  try {
    return await syncP2.syncService.syncDirtyNotesFromList(
      [notePoison, makeNote('n-good-2', 'valid')],
      [bodyPoison],
      [],
      () => null,
    )
  } catch {
    return -1
  }
})()
check(
  'P2.1 note phía sau vẫn được update sau khi body poison throw',
  noteUpdatesP2.includes('n-good-2'),
  `note updates = ${JSON.stringify(noteUpdatesP2)}`,
)
check(
  'P2.2 return count >= 1 (per-row count sau C9.2; note thành công + note sau poison)',
  countP2 >= 1 && noteUpdatesP2.includes('n-good-2'),
  `count = ${countP2}, note updates = ${JSON.stringify(noteUpdatesP2)}`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nCASE P3 — pin invariant: calendar loop đã có try/catch per-event (không regression)')
const calUpdates = []
const syncP3 = loadSyncWithMocks(
  { update: async () => makeNote('x', 'y') },
  {},
)
syncP3.calendarEventsService = {
  update: async (id) => {
    calUpdates.push(id)
    if (id === 'ev-poison') throw new Error('row not found')
    return { id }
  },
}
// Re-load with calendar mock wired
const syncConflictRealP3 = loadTsModule(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), { '@/utils/webLock': loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'), {}) })
const syncP3b = loadTsModule(SYNC_SERVICE_PATH, {
  '@/constants/storage': {
    NOTES_CACHE_KEY: 'notes_cache',
    NOTE_BODIES_CACHE_KEY: 'note_bodies_cache',
    FOLDERS_CACHE_KEY: 'folders_cache',
  },
  '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
  '@/utils/secureCrypto': { encryptField: async (v) => v, isEncryptedEnvelope: () => false },
  '@/utils/syncConflict': syncConflictRealP3,
  './calendarEvents.service': {
    calendarEventsService: {
      update: async (id) => {
        calUpdates.push(id)
        if (id === 'ev-poison') throw new Error('row not found')
        return { id }
      },
    },
  },
  './noteBodies.service': { noteBodiesService: { update: async () => ({}) } },
  './notes.service': { notesService: { update: async () => ({}) } },
  './localFirst/authMode': { isAuthenticated: async () => true, getCurrentUserId: async () => 'u1' },
  './localFirst/dataOwner.service': { isPushAllowedFor: async () => true },
})
const evSynced = synced
const evDirty = dirtyTs
const calCount = await syncP3b.syncService.syncDirtyCalendarEventsFromList([
  {
    id: 'ev-poison',
    title: 'x',
    description: '',
    event_date: '2026-01-01',
    is_done: false,
    position: 0,
    color: null,
    updated_at: evDirty,
    synced_at: evSynced,
  },
  {
    id: 'ev-good',
    title: 'y',
    description: '',
    event_date: '2026-01-01',
    is_done: false,
    position: 1,
    color: null,
    updated_at: evDirty,
    synced_at: evSynced,
  },
])
check(
  'P3 calendar dirty loop skip poison, push event phía sau',
  calUpdates.includes('ev-poison') && calUpdates.includes('ev-good') && calCount === 1,
  `cal updates = ${JSON.stringify(calUpdates)}, count = ${calCount}`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nCASE P4 — static: syncDirtyNotesFromList có try/catch per-note (mirror calendar)')
const syncSrc = fs.readFileSync(SYNC_SERVICE_PATH, 'utf8')
const notesLoop = syncSrc.match(
  /async syncDirtyNotesFromList[\s\S]*?for \(const n of candidates\) \{([\s\S]*?\n    \})/,
)
const loopBody = notesLoop?.[1] ?? ''
check(
  'P4 try/catch bọc per-note push (không để throw thoát khỏi for-loop)',
  /if \(isNoteDirty\(n\)\)[\s\S]*try\s*\{[\s\S]*await notesService\.update[\s\S]*\}\s*catch/.test(
    loopBody,
  ),
  'syncDirtyNotesFromList chưa có try/catch per-note — poison-pill vẫn chặn loop',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C5-poison-pill.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — poison-pill fix đúng spec.')
