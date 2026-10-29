/**
 * FAILING TEST — C16: không đăng nhập, xóa ghi chú / section / sự kiện bị "hồi sinh" — N5 giữ row dirty trên đĩa
 * vắng trong snapshot, mà row không đăng nhập luôn dirty (synced_at = null).
 *
 * Chạy:   node specs/C16-anonymous-delete-resurrect.test.mjs
 * RED trên 27bcd5d (và trên 2.0.0 gốc c37ab07 — tái hiện trên Chromium, xem spec).
 * GREEN sau khi áp specs/C16-anonymous-delete-resurrect.spec.md.
 *
 * Store THẬT (notes.ts, calendarEvents.ts) chạy trên Vue + Pinia thật; chrome.storage giả như Chrome (C11).
 */

import fs from 'node:fs'
import path from 'node:path'
import { types } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')
const vue = require('vue')
const pinia = require('pinia')

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
function loadTs(rel, mocks = {}) {
  const src = read(...rel.split('/'))
  if (!src) throw new Error(`chưa có ${rel}`)
  const js = ts.transpileModule(src, {
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

// ── chrome.storage giả: chuyển dữ liệu như Chrome (Proxy → object theo khóa — C11), đếm số lần ghi từng khóa ──
function chromeSerialize(v) {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v) && !types.isProxy(v)) return v.map(chromeSerialize)
  const out = {}
  for (const k of Object.keys(v)) out[k] = chromeSerialize(v[k])
  return out
}
const localMem = new Map()
const writes = new Map()
const writesOf = (key) => writes.get(key) ?? 0
globalThis.chrome = {
  storage: {
    local: {
      get: async (k) => {
        const keys = k == null ? [...localMem.keys()] : Array.isArray(k) ? k : [k]
        const out = {}
        for (const key of keys) if (localMem.has(key)) out[key] = structuredClone(localMem.get(key))
        return out
      },
      set: async (obj) => {
        for (const [key, v] of Object.entries(obj)) {
          localMem.set(key, chromeSerialize(v))
          writes.set(key, writesOf(key) + 1)
        }
      },
      remove: async (k) => {
        for (const key of Array.isArray(k) ? k : [k]) localMem.delete(key)
      },
      getBytesInUse: async () => 0,
    },
  },
}

const storageConsts = loadTs('src/constants/storage.ts')
const syncHelpers = loadTs('src/services/sync.service.ts', {
  '@/constants/storage': storageConsts,
  '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
  '@/utils/secureCrypto': {},
  './calendarEvents.service': { calendarEventsService: {} },
  './noteBodies.service': { noteBodiesService: {} },
  './notes.service': { notesService: {} },
  './localFirst/authMode': {},
  './localFirst/dataOwner.service': {},
  '@/utils/syncConflict': { isSyncConflictError: () => false, stashConflictBackup: async () => {} },
})
const cacheWrite = loadTs('src/utils/cacheWrite.ts')
const textMod = loadTs('src/utils/text.ts')
const T0 = '2026-10-01T00:00:00.000Z'
const T1 = '2026-10-02T00:00:00.000Z'
const scheduled = []
const undoToast = { useUndoToastStore: () => ({ schedule: async (a) => { scheduled.push(a) } }) }
const diskIds = (key) => (localMem.get(key) ?? []).map((r) => r.id).sort().join(',')

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — sync.service mergeSnapshotWithStored(…, dropIds) (CODE THẬT)')
{
  const dirty = (id) => ({ id, updated_at: T1, synced_at: null })
  const mine = [dirty('a')]
  const disk = [dirty('a'), dirty('gone'), dirty('other')]
  const keepAll = syncHelpers.mergeSnapshotWithStored(mine, disk, syncHelpers.isRowDirty).map((r) => r.id).sort().join(',')
  const dropped = syncHelpers.mergeSnapshotWithStored(mine, disk, syncHelpers.isRowDirty, new Set(['gone'])).map((r) => r.id).sort().join(',')
  check(
    'T1.1 dropIds: row dirty trên đĩa có id trong dropIds KHÔNG giữ; row dirty khác vẫn giữ (N5); không truyền → như cũ',
    keepAll === 'a,gone,other' && dropped === 'a,other',
    `không dropIds: ${keepAll} · dropIds {gone}: ${dropped}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — stores/notes.ts: xóa ghi chú / section khi không đăng nhập (CODE THẬT)')
const NK = storageConsts.NOTES_CACHE_KEY
const BK = storageConsts.NOTE_BODIES_CACHE_KEY
const anonNote = (id, title) => ({ id, user_id: '', folder_id: 'f1', title, tags: [], created_at: T0, updated_at: T0, synced_at: null, __synced: false })
const anonBody = (id, note_id, position = 0) => ({ id, user_id: '', note_id, label: '', content: `<p>${id}</p>`, position, created_at: T0, updated_at: T0, synced_at: null, __synced: false })
let useNotesStore = null
try {
  useNotesStore = loadTs('src/stores/notes.ts', {
    pinia,
    vue,
    '@/constants/storage': storageConsts,
    '@/services/noteBodies.service': { noteBodiesService: { getAll: async () => [], delete: async () => {} } },
    '@/services/notes.service': { notesService: { getAll: async () => [], delete: async () => {}, searchFullText: async () => [] } },
    '@/services/localFirst/localNotes.service': { localNoteBodiesService: {}, localNotesService: {} },
    '@/stores/folders': { useFoldersStore: () => ({ folders: [], isSecureFolder: () => false, alignActiveFolderToNoteFolder() {} }) },
    '@/stores/secureFolder': { useSecureFolderStore: () => ({ getKey: () => null, decryptLoadedSecureRows: async () => {} }) },
    '@/stores/accountCrypto': {
      useAccountCryptoStore: () => ({ fetched: true, markActivity() {}, decryptLoadedAccountRows: async () => {}, getContentKey: () => null, getDekId: () => null }),
    },
    '@/stores/auth': { useAuthStore: () => ({ isAuthenticated: false }) },
    '@/utils/secureCrypto': { isEncryptedEnvelope: () => false, encryptField: async (x) => x, decryptField: async (x) => x, encryptFieldV2: async (x) => x },
    '@/utils/withTimeout': { withTimeout: (p) => p },
    '@/utils/networkErrors': { isNetworkError: () => false },
    '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => T1 },
    '@/services/autoSync.service': { scheduleAutoSync: () => {} },
    '@/services/networkReachability.service': { isOnline: () => true },
    '@/services/sync.service': syncHelpers,
    '@/stores/undoToast': undoToast,
    '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
    '@/utils/cacheWrite': cacheWrite,
    '@/utils/secureCache': { sealSecureRowsForCache: async ({ notes, bodies }) => ({ notes, bodies, dropped: 0 }) },
    '@/utils/noteBodyIndex': loadTs('src/utils/noteBodyIndex.ts'),
    '@/utils/noteSearch': loadTs('src/utils/noteSearch.ts', { '@/utils/text': textMod }),
    '@/utils/rowsEqual': loadTs('src/utils/rowsEqual.ts'),
  }).useNotesStore
} catch (e) {
  check('T2.0 notes store load được', false, e.message)
}
if (useNotesStore) {
  localMem.clear()
  pinia.setActivePinia(pinia.createPinia())
  const S = useNotesStore()
  S.notes = [anonNote('n1', 'Kafka plan'), anonNote('n2', 'Second')]
  S.bodies = [anonBody('b1', 'n1'), anonBody('b2', 'n2', 0), anonBody('b3', 'n2', 1)]
  await S.persistCache()

  await S.deleteNote('n1')
  check(
    'T2.1 xóa ghi chú → biến khỏi RAM (danh sách) VÀ khỏi cache trên đĩa (ghi chú + body)',
    !S.notes.some((n) => n.id === 'n1') && diskIds(NK) === 'n2' && diskIds(BK) === 'b2,b3',
    `RAM=${S.notes.map((n) => n.id)} · notes_cache=${diskIds(NK)} · note_bodies_cache=${diskIds(BK)}`,
  )
  await scheduled.at(-1).undo()
  check('T2.2 hoàn tác → ghi chú + body quay lại RAM và cache', S.notes.some((n) => n.id === 'n1') && diskIds(NK) === 'n1,n2' && diskIds(BK) === 'b1,b2,b3', `notes_cache=${diskIds(NK)} · bodies=${diskIds(BK)}`)

  await S.deleteNote('n1')
  await scheduled.at(-1).commit()
  await S.persistCache()
  check('T2.3 xóa lại + hết hoàn tác (commit) + ghi tiếp → vẫn mất', diskIds(NK) === 'n2' && !S.notes.some((n) => n.id === 'n1'), `notes_cache=${diskIds(NK)}`)

  await S.deleteBody('b3')
  check('T2.4 xóa section (ghi chú còn section khác) → body mất khỏi RAM và cache', !S.bodies.some((b) => b.id === 'b3') && diskIds(BK) === 'b2', `bodies=${diskIds(BK)}`)

  // N5 giữ nguyên: sửa offline (dirty) của context khác nằm trên đĩa, snapshot mình không có → vẫn giữ.
  localMem.set(NK, [...localMem.get(NK), anonNote('n9', 'Từ tab khác')])
  await S.persistCache()
  check('T2.5 N5: row dirty của context khác (không phải mình xóa) vẫn được giữ', diskIds(NK) === 'n2,n9' && S.notes.some((n) => n.id === 'n9'), `notes_cache=${diskIds(NK)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — stores/calendarEvents.ts: xóa sự kiện khi không đăng nhập (CODE THẬT)')
const CK = 'calendar_events_cache'
const anonEv = (id, title) => ({ id, user_id: '', event_date: '2026-10-20', title, description: '', is_done: false, position: 0, color: null, start_time: null, end_time: null, created_at: T0, updated_at: T0, synced_at: null, __synced: false })
let useCal = null
try {
  useCal = loadTs('src/stores/calendarEvents.ts', {
    pinia,
    vue,
    '@/constants/calendar': loadTs('src/constants/calendar.ts'),
    '@/services/calendarEvents.service': { calendarEventsService: { getAll: async () => [], delete: async () => {} } },
    '@/services/localFirst/localCalendarEvents.service': { localCalendarEventsService: {} },
    '@/utils/calendarDate': loadTs('src/utils/calendarDate.ts'),
    '@/utils/calendarRecurrence': { recurrenceDates: () => [] },
    '@/utils/withTimeout': { withTimeout: (p) => p },
    '@/services/networkReachability.service': { isOnline: () => true },
    '@/utils/networkErrors': { isNetworkError: () => false },
    '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => T1 },
    '@/services/autoSync.service': { scheduleAutoSync: () => {} },
    '@/services/sync.service': syncHelpers,
    '@/stores/undoToast': undoToast,
    '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
    '@/utils/cacheWrite': cacheWrite,
    '@/utils/rowsEqual': loadTs('src/utils/rowsEqual.ts'),
  }).useCalendarEventsStore
} catch (e) {
  check('T3.0 calendar store load được', false, e.message)
}
if (useCal) {
  localMem.clear()
  pinia.setActivePinia(pinia.createPinia())
  const C = useCal()
  C.events = [anonEv('e1', 'VIB'), anonEv('e2', 'HSBC')]
  await C.persistCache()
  await C.deleteEvent('e1')
  check('T3.1 xóa sự kiện → mất khỏi RAM và cache', !C.events.some((e) => e.id === 'e1') && diskIds(CK) === 'e2', `RAM=${C.events.map((e) => e.id)} · cache=${diskIds(CK)}`)
  await scheduled.at(-1).undo()
  check('T3.2 hoàn tác → sự kiện quay lại', C.events.some((e) => e.id === 'e1') && diskIds(CK) === 'e1,e2', `cache=${diskIds(CK)}`)
  localMem.set(CK, [...localMem.get(CK), anonEv('e9', 'Từ tab khác')])
  await C.persistCache()
  check('T3.3 N5: sự kiện dirty của context khác vẫn được giữ', diskIds(CK) === 'e1,e2,e9', `cache=${diskIds(CK)}`)
}

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C16-anonymous-delete-resurrect.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. C16 đúng spec.')
