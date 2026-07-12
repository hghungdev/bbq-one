/**
 * FAILING TEST — N6+N7: SW lifecycle — autosync chết theo SW, token-refresh race, manual sync giả.
 *
 * Chạy:   node specs/N6-N7-sw-lifecycle-sync.test.mjs
 *
 * RED trên code hiện tại:
 *   - T1 fail: hasPendingSyncWork/hasLocalFirstPending chưa export.
 *   - T2 fail: 2 context chạy runBackgroundAutoSync đồng thời (không có SYNC_LOCK) → double-push.
 *   - T3 fail: webLock.ts / supabaseAuthLock chưa tồn tại.
 *   - W1-W3 fail: chưa wire.
 * GREEN sau khi áp specs/N6-N7-sw-lifecycle-sync.spec.md.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── mock chrome.storage.local ────────────────────────────────────────────────
const store = new Map()
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        if (keys === null || keys === undefined) return Object.fromEntries(store)
        const list = Array.isArray(keys) ? keys : [keys]
        const out = {}
        for (const k of list) if (store.has(k)) out[k] = store.get(k)
        return out
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) store.set(k, v)
      },
      async remove(keys) {
        const list = Array.isArray(keys) ? keys : [keys]
        for (const k of list) store.delete(k)
      },
    },
  },
  runtime: { sendMessage: async () => {} },
  alarms: { create() {}, get(_n, cb) { cb(undefined) } },
}

// ── mock navigator.locks = mutex thật (Node ≥21: navigator là getter-only) ──
const lockTails = new Map()
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    onLine: true,
    locks: {
      async request(name, optsOrFn, maybeFn) {
        const fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn
        const prev = lockTails.get(name) ?? Promise.resolve()
        let release
        const mine = new Promise((r) => (release = r))
        lockTails.set(name, prev.then(() => mine))
        await prev
        try {
          return await fn()
        } finally {
          release()
        }
      },
    },
  },
})

// ═════════════════════════════════════════════════════════════════════════════
// TIMELINE MINH HỌA — vì sao online-event + setTimeout chết trong MV3 SW
// ═════════════════════════════════════════════════════════════════════════════
console.log('TIMELINE — kịch bản hiện tại (encode hằng số thật autoSync.service.ts:13-15):')
console.log('  t=0s      user sửa note OFFLINE trong popup → dirty row nằm trong notes_cache')
console.log('  t=5s      user đóng popup — chỉ còn SW')
console.log('  t=35s     Chrome kill SW (idle ~30s, MV3)')
console.log('  t=60s     mạng có lại — event "online" KHÔNG đánh thức SW đã chết')
console.log('  t=60s+2s+4s  chuỗi ONLINE_STABLE_MS(2000)+ONLINE_DEBOUNCE_MS(4000) không bao giờ chạy')
console.log('  t=∞       data offline KẸT tới lần user mở popup — sau fix: alarm 5\' → push, trễ tối đa 300s')

// ── constants + mocks chung ──────────────────────────────────────────────────
const constants = loadTsModule(path.join(ROOT, 'src', 'constants', 'storage.ts'))
const CAL_KEY = 'calendar_events_cache'
const typesLocalFirst = loadTsModule(path.join(ROOT, 'src', 'types', 'localFirst.ts'))
const localStoreMod = loadTsModule(
  path.join(ROOT, 'src', 'services', 'localFirst', 'localStore.service.ts'),
  { '@/types/localFirst': typesLocalFirst },
)

let webLockMod = null
try {
  webLockMod = loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'))
} catch {
  /* chưa có */
}

// hai "context" độc lập = nạp module 2 lần (2 bản syncInFlight riêng, như popup + SW)
let active = 0
let maxActive = 0
const syncServiceMock = {
  syncService: {
    async syncFromCache() {
      active++
      maxActive = Math.max(maxActive, active)
      await sleep(50)
      active--
      return 1
    },
  },
  isRowDirty: (r) => !r.synced_at || new Date(r.updated_at) > new Date(r.synced_at),
}
function loadAutoSyncInstance() {
  const mocks = {
    '@/services/localFirst/authMode': { isAuthenticated: async () => true },
    '@/services/sync.service': syncServiceMock,
    '@/services/localFirst/syncEngine.service': { pushLocalToCloud: async () => ({ pushedNotes: 0, pushedNoteBodies: 0, pushedFolders: 0, pushedCalendarEvents: 0, errors: [] }) },
    '@/services/localFirst/localStore.service': localStoreMod,
    '@/types/localFirst': typesLocalFirst,
    '@/services/networkReachability.service': {
      initNetworkReachability() {},
      isOnline: () => true,
      onNetworkStatusChange: () => () => {},
    },
    '@/constants/storage': constants,
    '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: CAL_KEY },
  }
  if (webLockMod) mocks['@/utils/webLock'] = webLockMod
  return loadTsModule(path.join(ROOT, 'src', 'services', 'autoSync.service.ts'), mocks)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT1 — hasPendingSyncWork / hasLocalFirstPending (CODE THẬT autoSync.service.ts)')
{
  store.clear()
  const auto = loadAutoSyncInstance()
  if (typeof auto.hasPendingSyncWork !== 'function' || typeof auto.hasLocalFirstPending !== 'function') {
    check('T1.0 export hasPendingSyncWork + hasLocalFirstPending', false,
      `hasPendingSyncWork=${typeof auto.hasPendingSyncWork}, hasLocalFirstPending=${typeof auto.hasLocalFirstPending} ` +
        '— alarm retry không có cách nào biết "có việc cần push"')
  } else {
    check('T1.1 tất cả sạch → false', (await auto.hasPendingSyncWork()) === false, '')
    store.set(typesLocalFirst.LOCAL_STORAGE_KEYS.notes, [{ id: 'n1', __synced: false }])
    check('T1.2 local-first có entry → true', (await auto.hasPendingSyncWork()) === true, '')
    store.clear()
    store.set(constants.NOTES_CACHE_KEY, [
      { id: 'x', updated_at: '2026-07-13T00:00:02Z', synced_at: '2026-07-13T00:00:01Z' },
    ])
    check('T1.3 cache có row dirty → true', (await auto.hasPendingSyncWork()) === true, '')
  }
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — 2 context (popup + SW) chạy runBackgroundAutoSync ĐỒNG THỜI phải serialize')
{
  store.clear()
  active = 0
  maxActive = 0
  const ctx1 = loadAutoSyncInstance() // popup
  const ctx2 = loadAutoSyncInstance() // SW — syncInFlight riêng, KHÔNG chặn được nhau
  await Promise.all([
    ctx1.runBackgroundAutoSync('popup:pre-pull'),
    ctx2.runBackgroundAutoSync('sw:network-online'),
  ])
  check(
    'T2 số runner đồng thời tối đa = 1 (SYNC_LOCK cross-context)',
    maxActive === 1,
    `maxActive=${maxActive} — popup và SW cùng push 1 row baseline cũ → runner thua nhận BBQ_CONFLICT → ` +
      'stash "YOUR EDITS WERE SUPERSEDED" rác (đúng hiện tượng C9.2/N9), user mất niềm tin cảnh báo conflict thật',
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — supabaseAuthLock (CODE THẬT webLock.ts)')
if (!webLockMod || typeof webLockMod.supabaseAuthLock !== 'function') {
  check('T3.0 webLock.ts export supabaseAuthLock', false,
    'chưa tồn tại — SW refresh token không lock → race rotate refresh token → user bị logout ngẫu nhiên')
} else {
  const { supabaseAuthLock } = webLockMod
  const order = []
  await Promise.all([
    supabaseAuthLock('sb-auth', -1, async () => {
      order.push('a-start')
      await sleep(30)
      order.push('a-end')
    }),
    (async () => {
      await sleep(5)
      await supabaseAuthLock('sb-auth', -1, async () => {
        order.push('b-start')
        order.push('b-end')
      })
    })(),
  ])
  check('T3.1 2 refresh cùng lúc serialize (a xong mới tới b)',
    order.join(',') === 'a-start,a-end,b-start,b-end', `order=${order.join(',')}`)
  // fallback không có locks
  const savedNav = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined })
  let ran = false
  await supabaseAuthLock('sb-auth', -1, async () => { ran = true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: savedNav })
  check('T3.2 không có navigator.locks → vẫn chạy fn', ran, 'fallback vỡ — unit test/Chrome cũ chết')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring checks')
const supabaseSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'supabase.ts'), 'utf8')
check('W1 supabase.ts: auth.lock = supabaseAuthLock',
  /lock:\s*supabaseAuthLock/.test(supabaseSrc),
  'GoTrueClient trong SW vẫn refresh token không lock')

const bgSrc = fs.readFileSync(path.join(ROOT, 'src', 'background.ts'), 'utf8')
check('W2.1 background.ts có alarm bbqone-autosync-retry',
  bgSrc.includes('bbqone-autosync-retry'), 'không có đường sync bền khi SW bị kill')
check('W2.2 onAlarm branch: hasPendingSyncWork → runBackgroundAutoSync',
  bgSrc.includes('hasPendingSyncWork') && bgSrc.includes("runBackgroundAutoSync('alarm-retry')"),
  'alarm không nối vào sync')
check('W2.3 ensureAutoSyncRetryAlarm gọi ≥3 chỗ (onInstalled + onStartup + top-level)',
  (bgSrc.match(/ensureAutoSyncRetryAlarm\(\)/g) ?? []).length >= 3,
  `count=${(bgSrc.match(/ensureAutoSyncRetryAlarm\(\)/g) ?? []).length}`)

const syncStoreSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'sync.ts'), 'utf8')
const rmsStart = syncStoreSrc.indexOf('async function runManualSync')
const rmsBody = rmsStart === -1 ? '' : syncStoreSrc.slice(rmsStart, syncStoreSrc.indexOf('\n  }', rmsStart))
check('W3.1 runManualSync push local-first (pushLocalToCloud)',
  rmsBody.includes('pushLocalToCloud('),
  'note tạo offline không được push nhưng badge vẫn xanh "synced" — synced GIẢ')
check('W3.2 runManualSync sync calendar (syncDirtyCalendarEventsFromList)',
  rmsBody.includes('syncDirtyCalendarEventsFromList('),
  'event calendar sửa offline không bao giờ đi qua nút sync tay')

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/N6-N7-sw-lifecycle-sync.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix N6+N7 đúng spec.')
