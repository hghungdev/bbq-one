/**
 * FAILING TEST — C11: mảng reactive (Proxy) của Vue bị chrome.storage lưu thành object {0:…,1:…}.
 *
 * Chạy:   node specs/C11-cache-proxy-arrays.test.mjs
 *
 * chrome.storage giả chuyển dữ liệu GIỐNG Chrome: Proxy không được coi là mảng (V8 IsArray() = false
 * với Proxy) → thành object theo khóa. Đã đo trên extension thật (spec).
 * RED trên 6c61355: folders_cache / calendar_events_cache đọc lại không phải mảng → hydrate bỏ qua.
 * GREEN sau khi áp specs/C11-cache-proxy-arrays.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { types } from 'node:util'
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

function loadTs(rel, mocks = {}) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const req = (s) => {
    if (s in mocks) return mocks[s]
    throw new Error(`Unmocked import in ${path.basename(rel)}: ${s}`)
  }
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports)
  return mod.exports
}

// ── chrome.storage giả: chuyển dữ liệu như Chrome (Proxy → object theo khóa riêng, đếm được) ──
function chromeSerialize(v) {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v) && !types.isProxy(v)) return v.map(chromeSerialize)
  const out = {}
  for (const k of Object.keys(v)) out[k] = chromeSerialize(v[k])
  return out
}
const localMem = new Map()
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
        for (const [key, v] of Object.entries(obj)) localMem.set(key, chromeSerialize(v))
      },
      remove: async (k) => {
        for (const key of Array.isArray(k) ? k : [k]) localMem.delete(key)
      },
    },
  },
}

// ── vue giả có reactive THẬT kiểu Proxy (đúng thứ gây lỗi) ──
const REF = Symbol('ref')
const proxify = (v) => {
  if (v === null || typeof v !== 'object' || types.isProxy(v)) return v
  return new Proxy(v, { get: (t, p, r) => proxify(Reflect.get(t, p, r)) })
}
const vue = {
  ref: (v) => {
    let raw = v
    return {
      [REF]: true,
      get value() {
        return proxify(raw)
      },
      set value(n) {
        raw = n
      },
    }
  },
  computed: (fn) => ({
    [REF]: true,
    get value() {
      return fn()
    },
  }),
  watch: () => {},
}
const pinia = {
  defineStore: (_name, setup) => () => {
    const raw = setup()
    return new Proxy(raw, {
      get: (t, p) => (t[p] && t[p][REF] ? t[p].value : t[p]),
      set: (t, p, v) => {
        if (t[p] && t[p][REF]) t[p].value = v
        else t[p] = v
        return true
      },
    })
  },
}

console.log('C11 — mảng reactive (Proxy) không được lưu thành object')

let cw = null
try {
  cw = loadTs('src/utils/cacheWrite.ts')
} catch (e) {
  check('C11.0 cacheWrite load được', false, e.message)
}

if (cw) {
  await cw.safeCacheWrite({
    a: new Proxy([{ id: 'x' }, { id: 'y' }], {}),
    b: new Proxy({ tags: new Proxy(['t1', 't2'], {}), name: 'n' }, {}),
  })
  const a = localMem.get('a')
  const b = localMem.get('b')
  check(
    'C11.1 safeCacheWrite: mảng Proxy (cả lồng trong object) lưu thành MẢNG',
    Array.isArray(a) && a.length === 2 && a[1].id === 'y' && Array.isArray(b?.tags) && b.tags[1] === 't2' && b.name === 'n',
    `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`,
  )

  const r = cw.readCachedArray
  const ok =
    typeof r === 'function' &&
    JSON.stringify(r([1, 2])) === '[1,2]' &&
    JSON.stringify(r({ 0: 'a', 1: 'b', 2: 'c', 10: 'k', 3: 'd', 4: 'e', 5: 'f', 6: 'g', 7: 'h', 8: 'i', 9: 'j' })) ===
      JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']) &&
    JSON.stringify(r({})) === '[]' &&
    r(undefined) === null &&
    r({ foo: 1 }) === null &&
    r('x') === null
  check('C11.2 readCachedArray: mảng / {0:…} (theo thứ tự số) / {} → []; còn lại null', ok, 'sai cách đọc')
}

// ── Store thật: folders ──
const iso = '2026-10-20T00:00:00.000Z'
const folderRow = (id, name) => ({ id, name, position: 0, created_at: iso, updated_at: iso, is_secure: false, secure_salt: null, pbkdf2_iterations: 0, secure_verifier_enc: null })
const storageConsts = loadTs('src/constants/storage.ts')
const cacheMod = cw ?? { safeCacheWrite: async () => true }
const net = { online: false }
let foldersStore = null
try {
  foldersStore = loadTs('src/stores/folders.ts', {
    pinia,
    vue,
    '@/constants/storage': storageConsts,
    '@/services/folders.service': { foldersService: { getAll: async () => [folderRow('f1', 'Book'), folderRow('f2', 'Tool')] } },
    '@/services/localFirst/localNotes.service': { localFoldersService: {} },
    '@/stores/notes': { useNotesStore: () => ({ clearSearch() {}, selectNote() {} }) },
    '@/utils/withTimeout': { withTimeout: (p) => p },
    '@/services/networkReachability.service': { isOnline: () => net.online },
    '@/utils/networkErrors': { isNetworkError: () => false },
    '@/services/autoSync.service': { scheduleAutoSync: () => {} },
    '@/utils/cacheWrite': cacheMod,
  }).useFoldersStore
} catch (e) {
  check('C11.3 folders store load được', false, e.message)
}
if (foldersStore) {
  localMem.clear()
  net.online = true
  const s1 = foldersStore()
  await s1.loadAll()
  const disk = localMem.get(storageConsts.FOLDERS_CACHE_KEY)
  check(
    'C11.3 folders: tải online → folders_cache trên đĩa là MẢNG',
    Array.isArray(disk) && disk.length === 2,
    `đĩa=${JSON.stringify(disk)?.slice(0, 120)}`,
  )
  // Mở popup offline với cache hỏng từ bản cũ → vẫn thấy folder.
  localMem.set(storageConsts.FOLDERS_CACHE_KEY, { 0: folderRow('f1', 'Book'), 1: folderRow('f2', 'Tool') })
  net.online = false
  const s2 = foldersStore()
  await s2.loadAll()
  check(
    'C11.4 folders: cache hỏng dạng {0:…} (bản cũ) + offline → vẫn hiện đủ folder',
    Array.isArray(s2.folders) && s2.folders.length === 2,
    `folders=${JSON.stringify(s2.folders)?.slice(0, 120)}`,
  )
}

// ── Store thật: calendarEvents ──
const ev = (id, date, title, extra = {}) => ({ id, user_id: 'u1', event_date: date, title, description: '', is_done: false, position: 1, color: null, start_time: null, end_time: null, created_at: iso, updated_at: iso, synced_at: iso, ...extra })
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
let calStore = null
const serverEvents = [ev('e1', '2026-10-20', 'VIB (server)')]
try {
  calStore = loadTs('src/stores/calendarEvents.ts', {
    pinia,
    vue,
    '@/constants/calendar': loadTs('src/constants/calendar.ts'),
    '@/services/calendarEvents.service': { calendarEventsService: { getAll: async () => serverEvents.map((e) => ({ ...e })) } },
    '@/services/localFirst/localCalendarEvents.service': { localCalendarEventsService: {} },
    '@/utils/calendarDate': loadTs('src/utils/calendarDate.ts'),
    '@/utils/calendarRecurrence': { recurrenceDates: () => [] },
    '@/utils/withTimeout': { withTimeout: (p) => p },
    '@/services/networkReachability.service': { isOnline: () => net.online },
    '@/utils/networkErrors': { isNetworkError: () => false },
    '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => '' },
    '@/services/autoSync.service': { scheduleAutoSync: () => {} },
    '@/services/sync.service': syncHelpers,
    '@/stores/undoToast': { useUndoToastStore: () => ({}) },
    '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
    '@/utils/cacheWrite': cacheMod,
  }).useCalendarEventsStore
} catch (e) {
  check('C11.5 calendar store load được', false, e.message)
}
if (calStore) {
  localMem.clear()
  net.online = true
  const c1 = calStore()
  await c1.loadAll()
  const disk = localMem.get('calendar_events_cache')
  check(
    'C11.5 lịch: tải online → calendar_events_cache trên đĩa là MẢNG',
    Array.isArray(disk) && disk.length === 1,
    `đĩa=${JSON.stringify(disk)?.slice(0, 120)}`,
  )

  // Bản cũ đã ghi cache hỏng chứa một sửa offline (dirty) chưa push.
  const dirty = ev('e1', '2026-10-20', 'VIB (sửa offline)', { updated_at: '2026-10-21T00:00:00.000Z', synced_at: iso })
  localMem.set('calendar_events_cache', { 0: dirty })
  net.online = false
  const c2 = calStore()
  await c2.loadAll()
  check(
    'C11.6 lịch: cache hỏng {0:…} + offline → vẫn hiện sự kiện',
    Array.isArray(c2.events) && c2.events.length === 1,
    `events=${JSON.stringify(c2.events)?.slice(0, 120)}`,
  )
  net.online = true
  const c3 = calStore()
  await c3.loadAll()
  const disk2 = localMem.get('calendar_events_cache')
  const kept = Array.isArray(disk2) && disk2.find((e) => e.id === 'e1')
  check(
    'C11.7 lịch: tải online sau đó GIỮ sửa offline (dirty) từ cache hỏng, ghi lại dạng mảng → auto-sync đẩy được',
    kept && kept.title === 'VIB (sửa offline)' && syncHelpers.isCalendarEventDirty(kept),
    `đĩa=${JSON.stringify(disk2)?.slice(0, 160)}`,
  )
}

const calSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'calendarEvents.ts'), 'utf8')
const folSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'folders.ts'), 'utf8')
check(
  'C11.8 mọi chỗ đọc cache trong 2 store dùng readCachedArray (không còn Array.isArray thô)',
  (calSrc.match(/readCachedArray</g) ?? []).length >= 3 &&
    (folSrc.match(/readCachedArray</g) ?? []).length >= 2 &&
    !/Array\.isArray\((raw|stored\[)/.test(calSrc) &&
    !/Array\.isArray\(raw\)/.test(folSrc),
  'còn chỗ đọc cũ',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C11-cache-proxy-arrays.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. C11 đúng spec.')
