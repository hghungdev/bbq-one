/**
 * FAILING TEST — C3+C4+C6+C7 sync/delete hardening.
 *
 * Chạy:   node specs/C3-C4-C6-C7-sync-hardening.test.mjs
 * Smoke:  node specs/C3-C4-C6-C7-sync-hardening.test.mjs <path-to-alt-file>  (chưa hỗ trợ — dùng source thật)
 *
 * RED trên code hiện tại: C3 static + C4 behavior + C6 behavior + C7 static fail.
 * GREEN sau specs/C3-C4-C6-C7-sync-hardening.spec.md.
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

/** Extract commit callback body inside deleteNote/deleteEvent undoToast.schedule */
function extractDeleteCommitBlock(storeSrc, entityLabel) {
  const scheduleIdx = storeSrc.indexOf(`id: \`${entityLabel}:`)
  if (scheduleIdx < 0) return ''
  const commitIdx = storeSrc.indexOf('commit: async () => {', scheduleIdx)
  if (commitIdx < 0) return ''
  let depth = 0
  let started = false
  for (let i = commitIdx; i < storeSrc.length; i++) {
    const ch = storeSrc[i]
    if (ch === '{') {
      depth++
      started = true
    } else if (ch === '}') {
      depth--
      if (started && depth === 0) {
        return storeSrc.slice(commitIdx, i + 1)
      }
    }
  }
  return ''
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('C3 — offline delete commit: network error không restore (static wiring)')

const notesSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'notes.ts'), 'utf8')
const calStoreSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'calendarEvents.ts'), 'utf8')

const notesCommit = extractDeleteCommitBlock(notesSrc, 'note')
const calCommit = extractDeleteCommitBlock(calStoreSrc, 'calendar')

check(
  'C3a notes.ts delete commit: isNetworkError(e) trước restore + throw (giữ queue pending-delete)',
  /isNetworkError\s*\(\s*e\s*\)[\s\S]*throw/.test(notesCommit),
  'commit catch vẫn restore mọi lỗi → offline delete tự hồi sinh sau 5s',
)
check(
  'C3b calendarEvents.ts delete commit: isNetworkError(e) trước restore + throw',
  /isNetworkError\s*\(\s*e\s*\)[\s\S]*throw/.test(calCommit),
  'commit catch vẫn restore mọi lỗi',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nC4 — authenticated delete phải dọn LocalFirst (behavior, service thật)')

const supabaseDeleteOk = {
  from: () => ({
    delete: () => ({
      eq: async () => ({ error: null }),
    }),
  }),
}

let notesLocalDeleteCalls = []
const notesMod = loadTsModule(path.join(ROOT, 'src', 'services', 'notes.service.ts'), {
  './supabase': { supabase: supabaseDeleteOk },
  './noteBodies.service': { noteBodiesService: {} },
  '@/services/localFirst/authMode': { isAuthenticated: async () => true },
  '@/services/localFirst/localNotes.service': {
    localNotesService: {
      delete: async (id) => {
        notesLocalDeleteCalls.push(id)
      },
    },
  },
})

notesLocalDeleteCalls = []
await notesMod.notesService.delete('note-local-orphan')
check(
  'C4a notes.service delete(authenticated) gọi localNotesService.delete',
  notesLocalDeleteCalls.includes('note-local-orphan'),
  `local delete calls = ${JSON.stringify(notesLocalDeleteCalls)} — LocalFirst entry sống → resurrect qua pushLocalToCloud`,
)

let calLocalDeleteCalls = []
const calMod = loadTsModule(path.join(ROOT, 'src', 'services', 'calendarEvents.service.ts'), {
  '@/constants/calendar': { CALENDAR_MAX_EVENTS_PER_DAY: 50 },
  './supabase': { supabase: supabaseDeleteOk },
  '@/services/localFirst/authMode': { isAuthenticated: async () => true },
  '@/services/localFirst/localCalendarEvents.service': {
    localCalendarEventsService: {
      delete: async (id) => {
        calLocalDeleteCalls.push(id)
      },
    },
  },
})

calLocalDeleteCalls = []
await calMod.calendarEventsService.delete('ev-local-orphan')
check(
  'C4b calendarEvents.service delete(authenticated) gọi localCalendarEventsService.delete',
  calLocalDeleteCalls.includes('ev-local-orphan'),
  `local delete calls = ${JSON.stringify(calLocalDeleteCalls)}`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nC6 — pushLocalToCloud happy path: selective clear, không clearAllLocal mid-push orphans')

const LOCAL_KEYS = {
  notes: 'bbqone_local_notes',
  noteBodies: 'bbqone_local_note_bodies',
  folders: 'bbqone_local_folders',
  bookmarks: 'bbqone_local_bookmarks',
  calendarEvents: 'bbqone_local_calendar_events',
  metadata: 'bbqone_local_metadata',
}

const storeData = new Map([
  [LOCAL_KEYS.notes, [{ id: 'n1', title: 't', folder_id: null, tags: [], __synced: false }]],
  [LOCAL_KEYS.folders, []],
  [LOCAL_KEYS.noteBodies, []],
  [LOCAL_KEYS.bookmarks, []],
  [LOCAL_KEYS.calendarEvents, []],
])

let clearAllLocalCalled = false
let setArrayAfterPush = false

const localStoreMock = {
  async getArray(key) {
    return storeData.get(key) ?? []
  },
  async setArray(key, arr) {
    storeData.set(key, arr)
    if (key === LOCAL_KEYS.notes) setArrayAfterPush = true
  },
  async clearAllLocal() {
    clearAllLocalCalled = true
    for (const k of storeData.keys()) storeData.set(k, [])
  },
}

const syncEngine = loadTsModule(
  path.join(ROOT, 'src', 'services', 'localFirst', 'syncEngine.service.ts'),
  {
    '@/services/supabase': {
      supabase: {
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        from: () => ({
          upsert: async () => ({ error: null }),
        }),
      },
    },
    './authMode': { getCurrentUserId: async () => 'user-1' },
    './localStore.service': { localStore: localStoreMock },
    '@/types/localFirst': { LOCAL_STORAGE_KEYS: LOCAL_KEYS },
    './conflictDetector': { detectSyncConflicts: async () => ({ totalConflicts: 0 }) },
  },
)

clearAllLocalCalled = false
setArrayAfterPush = false
await syncEngine.pushLocalToCloud('use-local')

check(
  'C6.1 happy push KHÔNG gọi clearAllLocal (tránh xóa entry mới mid-push)',
  !clearAllLocalCalled,
  'clearAllLocal() vẫn chạy trên happy path → entry LocalFirst mới bị mất',
)
check(
  'C6.2 happy push dùng setArray selective (_clearSyncedEntries)',
  setArrayAfterPush,
  'không thấy setArray sau push — chưa dọn theo id đã sync',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nC7 — overdue reminder sau refresh + auth init (static App.vue)')

const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')

const onMountedBlock = appSrc.match(/onMounted\(async \(\) => \{([\s\S]*?)\n  \}\)/)?.[1] ?? ''

check(
  'C7a refreshStoresFromNetwork().then(() => maybeShowOverdueReminder()) trong onMounted',
  /refreshStoresFromNetwork\(\)\s*\.\s*then\s*\(\s*\(\)\s*=>\s*maybeShowOverdueReminder\s*\(\s*\)/.test(
    onMountedBlock,
  ),
  'maybeShowOverdueReminder chạy trên cache hydrate (có thể stale) trước khi pull xong',
)

check(
  'C7b watch(isAuthenticated) re-check maybeShowOverdueReminder',
  /watch\s*\(\s*isAuthenticated[\s\S]*maybeShowOverdueReminder\s*\(\s*\)/.test(appSrc),
  'auth.init >1.5s → isAuthenticated=false lúc mount → reminder skip cả phiên',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C3-C4-C6-C7-sync-hardening.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — C3/C4/C6/C7 sync hardening đúng spec.')
