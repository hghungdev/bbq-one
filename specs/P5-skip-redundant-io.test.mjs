/**
 * FAILING TEST — P5: bớt đọc / ghi thừa — mở popup không ghi lại cache khi không có gì mới; badge đồng bộ chỉ đọc
 * khi kho máy đổi.
 *
 * Chạy:   node specs/P5-skip-redundant-io.test.mjs
 * GREEN sau khi áp specs/P5-skip-redundant-io.spec.md.
 *
 * Store THẬT (notes.ts, calendarEvents.ts) chạy trên Vue + Pinia thật; chrome.storage giả đếm số lần ghi từng khóa.
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

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — utils/rowsEqual.ts sameRows (CODE THẬT)')
let RE = null
try {
  RE = loadTs('src/utils/rowsEqual.ts')
} catch (e) {
  check('T1.0 src/utils/rowsEqual.ts tồn tại', false, e.message)
}
if (RE?.sameRows) {
  const a = [{ id: '1', t: 'x', tags: ['a', 'b'] }, { id: '2', t: 'y', tags: [] }]
  const cases = [
    ['cùng row, khác thứ tự', RE.sameRows(a, [a[1], { ...a[0], tags: ['a', 'b'] }]), true],
    ['khác một trường', RE.sameRows(a, [a[0], { ...a[1], t: 'z' }]), false],
    ['tags khác phần tử', RE.sameRows(a, [{ ...a[0], tags: ['a'] }, a[1]]), false],
    ['thêm trường', RE.sameRows(a, [{ ...a[0], extra: 1 }, a[1]]), false],
    ['khác số row', RE.sameRows(a, [a[0]]), false],
    ['trùng id (a) không bù được row thiếu', RE.sameRows([a[0], a[0]], a), false],
    ['trùng id (b)', RE.sameRows(a, [a[0], a[0]]), false],
    ['reactive proxy vs object thường', RE.sameRows(vue.reactive(a.map((r) => ({ ...r }))), a), true],
    ['rỗng', RE.sameRows([], []), true],
  ]
  const bad = cases.filter(([, got, want]) => got !== want).map(([n, got]) => `${n}: ${got}`)
  check('T1.1 sameRows: theo id, từng trường ===, mảng so từng phần tử, thứ tự không quan trọng', bad.length === 0, bad.join('; '))
}

// ── Module dùng chung cho store ──
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
const rowsEqualMock = RE ?? { sameRows: () => false }
const T0 = '2026-10-01T00:00:00.000Z'
const T1 = '2026-10-02T00:00:00.000Z'
const T2 = '2026-10-03T00:00:00.000Z'

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — stores/notes.ts loadAll (CODE THẬT)')
const server = { notes: [], bodies: [] }
const clone = (x) => structuredClone(x)
const noteRow = (id, title) => ({ id, user_id: '', folder_id: 'f1', title, tags: ['t'], created_at: T0, updated_at: T0, synced_at: T0 })
const bodyRow = (id, note_id, content, extra = {}) => ({ id, user_id: '', note_id, label: '', content, position: 0, created_at: T0, updated_at: T0, synced_at: T0, ...extra })
let useNotesStore = null
try {
  useNotesStore = loadTs('src/stores/notes.ts', {
    pinia,
    vue,
    '@/constants/storage': storageConsts,
    '@/services/noteBodies.service': { noteBodiesService: { getAll: async () => server.bodies.map(clone) } },
    '@/services/notes.service': { notesService: { getAll: async () => server.notes.map(clone), searchFullText: async () => [] } },
    '@/services/localFirst/localNotes.service': { localNoteBodiesService: {}, localNotesService: {} },
    '@/stores/folders': { useFoldersStore: () => ({ folders: [], isSecureFolder: () => false, alignActiveFolderToNoteFolder() {} }) },
    '@/stores/secureFolder': { useSecureFolderStore: () => ({ getKey: () => null, decryptLoadedSecureRows: async () => {} }) },
    '@/stores/accountCrypto': {
      useAccountCryptoStore: () => ({ fetched: true, decryptLoadedAccountRows: async () => {}, getContentKey: () => null, getDekId: () => null }),
    },
    '@/stores/auth': { useAuthStore: () => ({ isAuthenticated: false }) },
    '@/utils/secureCrypto': { isEncryptedEnvelope: () => false, encryptField: async (x) => x, decryptField: async (x) => x, encryptFieldV2: async (x) => x },
    '@/utils/withTimeout': { withTimeout: (p) => p },
    '@/utils/networkErrors': { isNetworkError: () => false },
    '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => T2 },
    '@/services/autoSync.service': { scheduleAutoSync: () => {} },
    '@/services/networkReachability.service': { isOnline: () => true },
    '@/services/sync.service': syncHelpers,
    '@/stores/undoToast': { useUndoToastStore: () => ({}) },
    '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
    '@/utils/cacheWrite': cacheWrite,
    '@/utils/secureCache': { sealSecureRowsForCache: async ({ notes, bodies }) => ({ notes, bodies, dropped: 0 }) },
    '@/utils/noteBodyIndex': loadTs('src/utils/noteBodyIndex.ts'),
    '@/utils/noteSearch': loadTs('src/utils/noteSearch.ts', { '@/utils/text': textMod }),
    '@/utils/rowsEqual': rowsEqualMock,
  }).useNotesStore
} catch (e) {
  check('T2.0 notes store load được', false, e.message)
}
if (useNotesStore) {
  const NK = storageConsts.NOTES_CACHE_KEY
  localMem.clear()
  writes.clear()
  server.notes = [noteRow('n1', 'Một'), noteRow('n2', 'Hai')]
  server.bodies = [bodyRow('b1', 'n1', '<p>một</p>'), bodyRow('b2', 'n2', '<p>hai</p>')]
  pinia.setActivePinia(pinia.createPinia())
  const S = useNotesStore()
  await S.loadAll()
  check('T2.1 lần đầu (đĩa trống) → ghi cache 1 lần', writesOf(NK) === 1 && Array.isArray(localMem.get(NK)), `ghi ${writesOf(NK)}`)

  writes.clear()
  const rawBefore = vue.toRaw(S.bodies)
  await S.loadAll()
  check(
    'T2.2 tải lại, server không đổi → KHÔNG ghi cache, KHÔNG thay mảng RAM',
    writesOf(NK) === 0 && vue.toRaw(S.bodies) === rawBefore,
    `ghi ${writesOf(NK)}, mảng ${vue.toRaw(S.bodies) === rawBefore ? 'giữ' : 'thay'}`,
  )

  writes.clear()
  pinia.setActivePinia(pinia.createPinia())
  const S2 = useNotesStore()
  await S2.hydrateFromCache()
  await S2.loadAll()
  check('T2.3 popup mới (hydrate + loadAll), không đổi → KHÔNG ghi cache', writesOf(NK) === 0 && S2.notes.length === 2, `ghi ${writesOf(NK)}, ${S2.notes.length} ghi chú`)

  writes.clear()
  server.bodies = [bodyRow('b1', 'n1', '<p>một (sửa trên máy khác)</p>', { updated_at: T1, synced_at: T1 }), bodyRow('b2', 'n2', '<p>hai</p>')]
  await S2.loadAll()
  check(
    'T2.4 server đổi → ghi cache 1 lần, RAM có bản mới',
    writesOf(NK) === 1 && S2.bodies.find((b) => b.id === 'b1')?.content === '<p>một (sửa trên máy khác)</p>',
    `ghi ${writesOf(NK)}`,
  )

  // Sửa offline (dirty) đã nằm trên đĩa; server vẫn bản cũ → merge-guard giữ bản dirty, không có gì mới để ghi.
  S2.bodies = S2.bodies.map((b) => (b.id === 'b2' ? { ...b, content: '<p>hai (offline)</p>', updated_at: T2 } : b))
  await S2.persistCache()
  writes.clear()
  await S2.loadAll()
  const kept = S2.bodies.find((b) => b.id === 'b2')
  check(
    'T2.5 có sửa offline (dirty) đã lưu, server cũ → giữ bản dirty, KHÔNG ghi lại cache',
    writesOf(NK) === 0 && kept?.content === '<p>hai (offline)</p>' && syncHelpers.isRowDirty(kept),
    `ghi ${writesOf(NK)}, b2=${kept?.content}`,
  )

  // Cache trên đĩa thiếu một ghi chú (context khác vừa ghi bản cũ hơn) → RAM đúng nhưng đĩa sai → phải ghi.
  const disk = localMem.get(NK)
  localMem.set(NK, disk.filter((n) => n.id !== 'n2'))
  writes.clear()
  await S2.loadAll()
  check('T2.6 đĩa lệch với bản gộp → vẫn ghi lại cache', writesOf(NK) === 1 && localMem.get(NK).length === 2, `ghi ${writesOf(NK)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — stores/calendarEvents.ts loadAll (CODE THẬT)')
const CK = 'calendar_events_cache'
const ev = (id, title, extra = {}) => ({ id, user_id: '', event_date: '2026-10-20', title, description: '', is_done: false, position: 0, color: null, start_time: null, end_time: null, created_at: T0, updated_at: T0, synced_at: T0, ...extra })
const serverEvents = { list: [] }
let useCal = null
try {
  useCal = loadTs('src/stores/calendarEvents.ts', {
    pinia,
    vue,
    '@/constants/calendar': loadTs('src/constants/calendar.ts'),
    '@/services/calendarEvents.service': { calendarEventsService: { getAll: async () => serverEvents.list.map(clone) } },
    '@/services/localFirst/localCalendarEvents.service': { localCalendarEventsService: {} },
    '@/utils/calendarDate': loadTs('src/utils/calendarDate.ts'),
    '@/utils/calendarRecurrence': { recurrenceDates: () => [] },
    '@/utils/withTimeout': { withTimeout: (p) => p },
    '@/services/networkReachability.service': { isOnline: () => true },
    '@/utils/networkErrors': { isNetworkError: () => false },
    '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => T2 },
    '@/services/autoSync.service': { scheduleAutoSync: () => {} },
    '@/services/sync.service': syncHelpers,
    '@/stores/undoToast': { useUndoToastStore: () => ({}) },
    '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
    '@/utils/cacheWrite': cacheWrite,
    '@/utils/rowsEqual': rowsEqualMock,
  }).useCalendarEventsStore
} catch (e) {
  check('T3.0 calendar store load được', false, e.message)
}
if (useCal) {
  localMem.clear()
  writes.clear()
  serverEvents.list = [ev('e1', 'VIB'), ev('e2', 'HSBC')]
  pinia.setActivePinia(pinia.createPinia())
  const C = useCal()
  await C.loadAll()
  writes.clear()
  const rawBefore = vue.toRaw(C.events)
  await C.loadAll()
  check(
    'T3.1 lịch: tải lại không đổi → KHÔNG ghi cache, KHÔNG thay mảng RAM',
    writesOf(CK) === 0 && vue.toRaw(C.events) === rawBefore,
    `ghi ${writesOf(CK)}`,
  )
  serverEvents.list = [ev('e1', 'VIB (đổi giờ)', { updated_at: T1, synced_at: T1 }), ev('e2', 'HSBC')]
  writes.clear()
  await C.loadAll()
  check('T3.2 lịch: server đổi → ghi 1 lần', writesOf(CK) === 1 && C.events.some((e) => e.title === 'VIB (đổi giờ)'), `ghi ${writesOf(CK)}`)
  // Cache hỏng dạng {0:…} (bản cũ) dù nội dung y hệt → vẫn phải ghi lại thành MẢNG (C11).
  const arr = localMem.get(CK)
  localMem.set(CK, Object.fromEntries(arr.map((r, i) => [i, r])))
  writes.clear()
  pinia.setActivePinia(pinia.createPinia())
  const C2 = useCal()
  await C2.loadAll()
  check('T3.3 lịch: cache hỏng {0:…} cùng nội dung → vẫn ghi lại dạng mảng', writesOf(CK) === 1 && Array.isArray(localMem.get(CK)), `ghi ${writesOf(CK)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — SyncStatusBadge.vue chỉ đọc khi kho máy đổi (tĩnh)')
const badge = read('src', 'components', 'sync', 'SyncStatusBadge.vue')
const handler = badge.match(/function onStorageChanged\([\s\S]*?\n}\n/)?.[0] ?? ''
check(
  "T4.1 onStorageChanged(changes, area): bỏ qua area ≠ 'local' và khóa ngoài LOCAL_STORAGE_KEYS / BBQ_AUTH_LOGGED_IN_KEY",
  /onStorageChanged\(\s*changes[\s\S]*?,\s*area\s*:/.test(handler) && /area !== 'local'/.test(handler) &&
    /LOCAL_STORAGE_KEYS/.test(badge) && /BBQ_AUTH_LOGGED_IN_KEY/.test(badge),
  'badge vẫn đọc lại kho ở mọi thay đổi storage',
)
check(
  'T4.2 gộp nhịp (setTimeout 250 ms) + clearTimeout khi unmount',
  /setTimeout\([\s\S]*?250\)/.test(handler) && /onUnmounted\([\s\S]*?clearTimeout\(/.test(badge),
  'chưa gộp nhịp / chưa dọn timer',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/P5-skip-redundant-io.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. P5 đúng spec.')
