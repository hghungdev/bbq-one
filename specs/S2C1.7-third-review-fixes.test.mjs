/**
 * FAILING TEST — S2C1.7: review độc lập LẦN 3 (chỉ nhắm commit S2C1.6 `81ef518`).
 *
 * Chạy:   node specs/S2C1.7-third-review-fixes.test.mjs   (Node ≥ 20 — WebCrypto thật)
 *
 * Bộ dựng như S2C1.6 (code thật notes + accountCrypto + secureCache + accountSession; pinia giả có
 * unwrap ref) + code thật `router/index.ts` + `stores/auth.ts` với `getSession()` bị "treo".
 *
 * RED trên 81ef518:
 *   - R1: auth.init() quá hạn → store "chưa đăng nhập" trong khi service vẫn thấy session → hai cổng
 *         (holdWritesLocal, cổng draft) mở → bản rõ lên server.
 *   - R2: timer / refreshStoresFromNetwork mở lại modal mở khóa mỗi lần hỏi lại trạng thái.
 *   - R3: noteBodiesService.delete (đã đăng nhập) không xóa bản local-first → body sống lại;
 *         foldersService.delete cùng lỗi (3b).
 * GREEN sau khi áp specs/S2C1.7-third-review-fixes.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

if (typeof globalThis.crypto?.subtle !== 'object') {
  console.error('Node này không có WebCrypto (cần Node ≥ 20). Bỏ chạy.')
  process.exit(1)
}

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}

async function attempt(fn) {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) }
  }
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

/** Cả hàm (từ `async function name(` tới `}` khớp) — để chạy thật, không chỉ đọc chuỗi. */
function extractWholeFn(src, fnName) {
  const start = src.indexOf(`async function ${fnName}(`)
  if (start === -1) return null
  let depth = 0
  let i = src.indexOf('{\n', start)
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return null
}

// ── chrome giả ──────────────────────────────────────────────────────────────
const sessionMem = new Map()
const localMem = new Map()
function area(mem) {
  return {
    get: async (k) => {
      const keys = k == null ? [...mem.keys()] : Array.isArray(k) ? k : [k]
      const out = {}
      for (const key of keys) if (mem.has(key)) out[key] = structuredClone(mem.get(key))
      return out
    },
    set: async (obj) => {
      for (const [key, v] of Object.entries(obj)) mem.set(key, structuredClone(v))
    },
    remove: async (k) => {
      for (const key of Array.isArray(k) ? k : [k]) mem.delete(key)
    },
  }
}
globalThis.chrome = {
  storage: { session: area(sessionMem), local: area(localMem) },
  alarms: { create: () => {} },
}

// ── vue / pinia giả: unwrap ref + singleton theo tên (mỗi resetStores = một popup mới) ──
const REF = Symbol('ref')
const vue = {
  ref: (v) => ({ [REF]: true, value: v }),
  shallowRef: (v) => ({ [REF]: true, value: v }),
  computed: (fn) => ({
    [REF]: true,
    get value() {
      return fn()
    },
  }),
}
const registry = new Map()
const resetStores = () => registry.clear()
const pinia = {
  defineStore: (name, setup) => () => {
    if (!registry.has(name)) {
      const raw = setup()
      registry.set(
        name,
        new Proxy(raw, {
          get: (t, p) => (t[p] && t[p][REF] ? t[p].value : t[p]),
          set: (t, p, v) => {
            if (t[p] && t[p][REF]) t[p].value = v
            else t[p] = v
            return true
          },
        }),
      )
    }
    return registry.get(name)
  },
}

const secureCrypto = loadTs('src/utils/secureCrypto.ts')
const acctUtils = loadTs('src/utils/accountCrypto.ts', { '@/utils/secureCrypto': secureCrypto })
const cacheMod = loadTs('src/utils/secureCache.ts', { '@/utils/secureCrypto': secureCrypto })
const S = loadTs('src/utils/accountSession.ts', {
  '@/utils/accountCrypto': acctUtils,
  '@/utils/secureCrypto': secureCrypto,
})
const storageConsts = loadTs('src/constants/storage.ts')
const LOGGED_IN_KEY = storageConsts.BBQ_AUTH_LOGGED_IN_KEY

function makeGate() {
  let open
  const promise = new Promise((r) => (open = r))
  return { promise, open }
}
const macro = () => new Promise((r) => setTimeout(r, 0))

// ── Supabase auth giả: getSession() có thể "treo" (làm mới token qua mạng chậm) ──
const SESSION = { access_token: 'tok', user: { id: 'u1', email: 'u1@example.com' } }
const authNet = { gate: null, session: SESSION }
const supabaseAuthMock = {
  auth: {
    getSession: async () => {
      if (authNet.gate) await authNet.gate.promise
      return { data: { session: authNet.session }, error: null }
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
}
const authStore = loadTs('src/stores/auth.ts', {
  pinia,
  vue,
  '@/services/supabase': { supabase: supabaseAuthMock },
  '@/services/bookmarkAutoBackup.service': { bootstrapBookmarkBaseline: async () => {} },
  '@/stores/bookmarkPin': { useBookmarkPinStore: () => ({ lock: async () => {} }) },
  '@/utils/bookmarkFingerprint': { clearPersistedBookmarkTreeHash: async () => {} },
  '@/services/auth.service': { authService: {} },
  '@/services/supabaseAuthRecovery.service': { recoverSupabaseAuthFromStaleSession: async () => {} },
  '@/constants/storage': storageConsts,
  '@/services/calendarBannerDismiss.service': { clearUpcomingBannerDismiss: async () => {} },
  '@/services/calendarOverdueReminder.service': { clearOverdueReminderDismiss: async () => {} },
}).useAuthStore

// ── server giả (service ghi chú tự hỏi getSession → luôn thấy session thật) ──
const net = { online: true, authed: true, userId: 'u1', row: null }
const serverWrites = []
const userCryptoSvc = {
  fetchUserCryptoStatus: async () => {
    if (!net.online) throw new Error('Failed to fetch')
    return net.authed ? { userId: net.userId, row: net.row && { ...net.row } } : null
  },
  fetchUserCryptoRow: async () => (net.row ? { ...net.row } : null),
  upsertUserCryptoRow: async (r) => {
    net.row = { ...r }
  },
}
let ctr = 0
const stamp = () => new Date(Date.now() + ctr++).toISOString()
const offlineErr = () => Object.assign(new Error('offline'), { network: true })
const notesService = {
  create: async (i) => {
    if (!net.authed) throw offlineErr()
    const r = { id: 'n' + ctr++, user_id: 'u1', tags: [], ...i, updated_at: stamp(), synced_at: stamp() }
    serverWrites.push(['notes.create', r])
    return r
  },
  update: async (id, p, o) => {
    if (!net.authed) throw offlineErr()
    serverWrites.push(['notes.update', id, p])
    return { ...(o?.row ?? {}), ...p, id, updated_at: stamp(), synced_at: stamp() }
  },
  delete: async () => {},
  getAll: async () => [],
  searchFullText: async () => [],
}
const noteBodiesServiceFake = {
  create: async (nid, r) => {
    if (!net.authed) throw offlineErr()
    const row = { id: 'b' + ctr++, note_id: nid, user_id: 'u1', ...r, updated_at: stamp(), synced_at: stamp() }
    serverWrites.push(['bodies.create', row])
    return row
  },
  update: async (id, p, o) => {
    if (!net.authed) throw offlineErr()
    serverWrites.push(['bodies.update', id, p])
    return { ...(o?.row ?? {}), ...p, id, updated_at: stamp(), synced_at: stamp() }
  },
  delete: async () => {},
  getAll: async () => [],
}
const localNotes = {
  localNotesService: {
    create: async (i) => ({ id: 'L' + ctr++, tags: [], ...i, created_at: stamp(), updated_at: stamp() }),
  },
  localNoteBodiesService: {
    create: async (nid, r) => ({ id: 'LB' + ctr++, note_id: nid, ...r, created_at: stamp(), updated_at: stamp() }),
  },
}
const syncSvc = loadTs('src/services/sync.service.ts', {
  '@/constants/storage': storageConsts,
  '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'cal' },
  '@/utils/secureCrypto': secureCrypto,
  './calendarEvents.service': { calendarEventsService: {} },
  './noteBodies.service': { noteBodiesService: noteBodiesServiceFake },
  './notes.service': { notesService },
  './localFirst/authMode': {},
  './localFirst/dataOwner.service': {},
  '@/utils/syncConflict': { isSyncConflictError: () => false, stashConflictBackup: async () => {} },
})

let notesStore = null
const accountStore = loadTs('src/stores/accountCrypto.ts', {
  pinia,
  vue,
  '@/utils/accountCrypto': acctUtils,
  '@/utils/secureCrypto': secureCrypto,
  '@/utils/secureCache': cacheMod,
  '@/utils/accountSession': S,
  '@/services/userCrypto.service': userCryptoSvc,
  '@/stores/notes': { useNotesStore: () => notesStore() },
}).useAccountCryptoStore
notesStore = loadTs('src/stores/notes.ts', {
  pinia,
  vue,
  '@/constants/storage': storageConsts,
  '@/services/noteBodies.service': { noteBodiesService: noteBodiesServiceFake },
  '@/services/notes.service': { notesService, filterNotesBySubstring: () => [] },
  '@/services/localFirst/localNotes.service': localNotes,
  '@/stores/folders': { useFoldersStore: () => ({ folders: [], isSecureFolder: () => false }) },
  '@/stores/secureFolder': { useSecureFolderStore: () => ({ getKey: () => null, decryptLoadedSecureRows: async () => {} }) },
  '@/stores/accountCrypto': { useAccountCryptoStore: () => accountStore() },
  // Cờ đăng nhập lấy từ auth store THẬT (đúng thứ router điền vào).
  '@/stores/auth': { useAuthStore: () => authStore() },
  '@/utils/secureCrypto': secureCrypto,
  '@/utils/withTimeout': { withTimeout: (p) => p },
  '@/utils/networkErrors': { isNetworkError: (e) => e?.network === true },
  '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => stamp() },
  '@/services/autoSync.service': { scheduleAutoSync: () => {} },
  '@/services/networkReachability.service': { isOnline: () => net.online },
  '@/services/sync.service': syncSvc,
  '@/stores/undoToast': { useUndoToastStore: () => ({ schedule: async () => {} }) },
  '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
  '@/utils/cacheWrite': {
    safeCacheWrite: async (items) => {
      await chrome.storage.local.set(items)
      return true
    },
  },
  '@/utils/secureCache': cacheMod,
  '@/utils/noteBodyIndex': loadTs('src/utils/noteBodyIndex.ts'), // P3: import mới của notes.ts (code thật, thuần)
}).useNotesStore

// ── router thật; withTimeout thật nhưng rút 1,5 s → 30 ms cho test nhanh ──
const realWithTimeout = loadTs('src/utils/withTimeout.ts').withTimeout
let guard = null
loadTs('src/router/index.ts', {
  'vue-router': {
    createRouter: () => ({
      beforeEach: (fn) => {
        guard = fn
      },
    }),
    createWebHashHistory: () => ({}),
  },
  '@/stores/auth': { useAuthStore: () => authStore() },
  '@/utils/withTimeout': { withTimeout: (p, _ms, msg) => realWithTimeout(p, 30, msg) },
  '@/services/networkReachability.service': { isOnline: () => net.online },
  '@/constants/storage': storageConsts,
})
/** Một lần mở popup: chạy guard của router như vue-router (await guard → next). */
async function openPopup() {
  resetStores()
  let nextCalled = false
  await guard({ name: 'dashboard' }, {}, () => {
    nextCalled = true
  })
  return { auth: authStore(), nextCalled }
}

const PASS = 'passphrase đúng 10+'
const KP = { kdfParams: { iterations: 1_000 } }
const SOFT = (a) => !!a.session?.__offlineHydrated

// ═════════════════════════════════════════════════════════════════════════════
console.log('R1 — auth.init() quá hạn lúc online: store không được "chưa đăng nhập" khi service có session')
{
  // Phiên trước: đăng nhập bình thường, bật mã hóa, có ghi chú bí mật trên server + đĩa (đã seal).
  localMem.clear()
  sessionMem.clear()
  Object.assign(net, { online: true, authed: true, userId: 'u1', row: null })
  Object.assign(authNet, { gate: null, session: SESSION })
  const first = await openPopup()
  const acct0 = accountStore()
  await acct0.refreshStatus()
  await acct0.enableAccountEncryption(PASS, KP)
  const n0 = notesStore()
  await n0.createNote(null, 'ALPHA-SECRET-TITLE')
  await n0.updateBody(n0.activeBodyId, { content: 'ALPHA-SECRET-BODY' })
  const secretBodyId = n0.activeBodyId
  check(
    'R1.0 (dựng) phiên trước đăng nhập thật + cờ "đã đăng nhập" đã lưu',
    first.auth.isAuthenticated && !SOFT(first.auth) && localMem.get(LOGGED_IN_KEY) === true,
    `authed=${first.auth.isAuthenticated} flag=${localMem.get(LOGGED_IN_KEY)}`,
  )

  // Mở lại trình duyệt (session RAM mất) → mở popup; access token hết hạn, làm mới qua mạng chậm.
  sessionMem.clear()
  authNet.gate = makeGate()
  const { auth, nextCalled } = await openPopup()
  check(
    'R1.1 init quá hạn + cờ đã lưu = đăng nhập → store coi là ĐÃ đăng nhập (session mềm), popup vẫn mở',
    nextCalled && auth.initialized === true && auth.isAuthenticated === true,
    `next=${nextCalled} initialized=${auth.initialized} isAuthenticated=${auth.isAuthenticated}`,
  )

  // App.vue: refreshAccountCryptoStatus đang chờ getUser (cũng treo) → trạng thái mã hóa CHƯA biết.
  const acct = accountStore()
  const notes = notesStore()
  await notes.hydrateFromCache()
  serverWrites.length = 0
  check(
    'R1.2 cổng draft (App.vue maybeRestoreNoteDraft: isAuthenticated && !fetched) giữ draft lại',
    auth.isAuthenticated && !acct.fetched,
    `isAuthenticated=${auth.isAuthenticated} fetched=${acct.fetched}`,
  )
  // Nếu draft vẫn bị áp / user gõ ngay: ghi được (thiết kế A) nhưng KHÔNG lên server.
  const d = await attempt(() => notes.updateBody(secretBodyId, { content: 'DRAFT-PLAINTEXT-LEAK' }))
  const c = await attempt(() => notes.createNote(null, 'NEW-TITLE-LEAK'))
  const u = await attempt(() => notes.updateBody(notes.activeBodyId, { content: 'NEW-BODY-LEAK' }))
  const sent = JSON.stringify(serverWrites)
  check(
    'R1.3 ghi lúc init còn treo vẫn được (không mất quyền sửa)',
    d.ok && c.ok && u.ok,
    `draft=${d.ok ? 'ok' : d.msg} create=${c.ok ? 'ok' : c.msg} body=${u.ok ? 'ok' : u.msg}`,
  )
  check(
    'R1.4 KHÔNG bản rõ nào lên server (draft / tiêu đề / nội dung mới)',
    !/DRAFT-PLAINTEXT-LEAK|NEW-TITLE-LEAK|NEW-BODY-LEAK/.test(sent),
    `server nhận: ${sent.slice(0, 220)}`,
  )

  // init() chạy nền xong → session thật thay session mềm.
  authNet.gate.open()
  authNet.gate = null
  await macro()
  check(
    'R1.5 init xong → session THẬT (user u1), không còn session mềm',
    auth.isAuthenticated && !SOFT(auth) && auth.user?.id === 'u1',
    `isAuthenticated=${auth.isAuthenticated} soft=${SOFT(auth)} user=${auth.user?.id}`,
  )
}

console.log('R1b — cờ đã lưu nhưng session thật đã mất / cờ = chưa đăng nhập')
{
  // Token bị thu hồi ở máy khác: cờ vẫn true, getSession treo rồi trả null.
  authNet.gate = makeGate()
  authNet.session = SESSION
  const { auth } = await openPopup()
  const softBefore = auth.isAuthenticated
  authNet.session = null
  authNet.gate.open()
  authNet.gate = null
  await macro()
  check(
    'R1.6 session mềm → init trả null → về "chưa đăng nhập" (watch(isAuthenticated) khóa + local mode)',
    softBefore === true && auth.isAuthenticated === false,
    `trước=${softBefore} sau=${auth.isAuthenticated}`,
  )

  // Chưa từng đăng nhập (cờ false) + init treo → vẫn local mode như trước.
  localMem.set(LOGGED_IN_KEY, false)
  authNet.gate = makeGate()
  const r = await openPopup()
  check(
    'R1.7 cờ = chưa đăng nhập + init treo → popup mở, local mode (không đổi hành vi)',
    r.nextCalled && r.auth.isAuthenticated === false,
    `next=${r.nextCalled} isAuthenticated=${r.auth.isAuthenticated}`,
  )
  authNet.gate.open()
  authNet.gate = null
  authNet.session = SESSION
  await macro()
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('R2 — hỏi lại trạng thái định kỳ KHÔNG mở lại modal mở khóa')
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
{
  const fnTs = extractWholeFn(appSrc, 'refreshAccountCryptoStatus') ?? ''
  const fnJs = ts.transpileModule(fnTs, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  /** Account giả: enabledBefore = null → chưa biết trạng thái. Đang khóa, session không có DEK. */
  function fakeAccount(enabledBefore, enabledAfter) {
    const a = {
      row: enabledBefore ? {} : null,
      fetched: enabledBefore !== null,
      stale: false,
      unlockModalOpen: false,
      async refreshStatus() {
        a.row = enabledAfter ? {} : null
        a.fetched = true
      },
      isEnabled: () => !!a.row,
      isUnlocked: () => false,
      statusAgeMs: () => 0,
      restoreFromSession: async () => false,
      decryptLoadedAccountRows: async () => {},
    }
    return a
  }
  function makeRefresh(account) {
    const deps = {
      isAuthenticated: { value: true },
      account,
      console: { warn() {} },
      hasPendingSyncWork: async () => false,
      scheduleAutoSync: () => {},
      maybeRestoreNoteDraft: async () => {},
    }
    return new Function(...Object.keys(deps), `${fnJs}\nreturn refreshAccountCryptoStatus`)(
      ...Object.values(deps),
    )
  }
  const run = async (account, ...args) => {
    const r = await attempt(() => makeRefresh(account)(...args))
    return r.ok ? account.unlockModalOpen : `lỗi: ${r.msg}`
  }

  check('R2.0 (dựng) tìm thấy refreshAccountCryptoStatus trong App.vue', fnTs.length > 0, 'không thấy')
  const timerLike = await run(fakeAccount(true, true), false)
  check(
    'R2.1 account bật + đang khóa, đã biết từ trước: hỏi lại KHÔNG nhắc (promptUnlock=false) → modal đóng',
    timerLike === false,
    `unlockModalOpen=${timerLike}`,
  )
  const mountLike = await run(fakeAccount(true, true))
  check('R2.2 mặc định (mở popup / đăng nhập) vẫn mở modal', mountLike === true, `unlockModalOpen=${mountLike}`)
  const firstKnown = await run(fakeAccount(null, true), false)
  check(
    'R2.3 trước đó CHƯA biết trạng thái → giờ biết account bật → vẫn nhắc mở khóa (lần đầu)',
    firstKnown === true,
    `unlockModalOpen=${firstKnown}`,
  )
  const enabledElsewhere = await run(fakeAccount(false, true), false)
  check(
    'R2.4 vừa bật mã hóa ở máy khác (trước: chưa bật) → nhắc một lần',
    enabledElsewhere === true,
    `unlockModalOpen=${enabledElsewhere}`,
  )

  const mountBody = appSrc.slice(appSrc.indexOf('onMounted(async'), appSrc.indexOf('onUnmounted('))
  const timerBlock = mountBody.slice(mountBody.indexOf('setInterval('), mountBody.indexOf('}, 60_000)'))
  check(
    'R2.5 timer 60 s gọi refreshAccountCryptoStatus(false)',
    timerBlock.includes('refreshAccountCryptoStatus(false)'),
    timerBlock.replace(/\s+/g, ' ').slice(0, 200),
  )
  const storesFn = extractWholeFn(appSrc, 'refreshStoresFromNetwork') ?? ''
  check(
    'R2.6 refreshStoresFromNetwork (mỗi lần auto-sync xong / có mạng lại) gọi refreshAccountCryptoStatus(false)',
    storesFn.includes('refreshAccountCryptoStatus(false)'),
    storesFn.replace(/\s+/g, ' ').slice(0, 260),
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('R3 — noteBodiesService.delete (đã đăng nhập) xóa cả bản local-first')
{
  const r3 = { authed: true, cloudError: null }
  const cloudDeletes = []
  const localDeletes = []
  const sb = {
    from: (table) => ({
      delete: () => ({
        eq: async (_col, id) => {
          cloudDeletes.push([table, id])
          return { error: r3.cloudError }
        },
      }),
    }),
  }
  const { noteBodiesService } = loadTs('src/services/noteBodies.service.ts', {
    './supabase': { supabase: sb },
    '@/services/localFirst/authMode': { isAuthenticated: async () => r3.authed },
    '@/services/localFirst/localNotes.service': {
      localNoteBodiesService: {
        delete: async (id) => {
          localDeletes.push(id)
        },
      },
    },
    '@/utils/syncConflict': {
      acceptServerRow: (x) => x,
      isSyncConflictError: () => false,
      resolveExpectedServerUpdatedAt: () => null,
      throwIfSyncConflict: () => {},
    },
    '@/utils/supabaseFetchAll': { fetchAllRows: async () => [] },
  })

  const a = await attempt(() => noteBodiesService.delete('held-body'))
  check(
    'R3.1 đã đăng nhập: xóa trên server RỒI xóa bản local-first (pushLocalToCloud không đẩy lại)',
    a.ok &&
      cloudDeletes.some(([t, id]) => t === 'note_bodies' && id === 'held-body') &&
      localDeletes.includes('held-body'),
    `ok=${a.ok} cloud=${JSON.stringify(cloudDeletes)} local=${JSON.stringify(localDeletes)}`,
  )

  cloudDeletes.length = 0
  localDeletes.length = 0
  r3.cloudError = { message: 'PGRST: delete rejected' }
  const b = await attempt(() => noteBodiesService.delete('b2'))
  check(
    'R3.2 server lỗi → ném, KHÔNG xóa bản local (không xóa nửa vời)',
    !b.ok && localDeletes.length === 0,
    `ok=${b.ok} local=${JSON.stringify(localDeletes)}`,
  )

  cloudDeletes.length = 0
  r3.cloudError = null
  r3.authed = false
  const c = await attempt(() => noteBodiesService.delete('b3'))
  check(
    'R3.3 local mode: chỉ xóa local như cũ',
    c.ok && localDeletes.includes('b3') && cloudDeletes.length === 0,
    `ok=${c.ok} cloud=${JSON.stringify(cloudDeletes)} local=${JSON.stringify(localDeletes)}`,
  )

  // 3b: foldersService.delete cùng lỗi (notes / calendar đã dọn local, folders thì chưa).
  cloudDeletes.length = 0
  localDeletes.length = 0
  r3.authed = true
  const { foldersService } = loadTs('src/services/folders.service.ts', {
    './supabase': { supabase: sb },
    '@/utils/secureCrypto': { DEFAULT_PBKDF2_ITERATIONS: 600_000 },
    '@/services/localFirst/authMode': { isAuthenticated: async () => r3.authed },
    '@/services/localFirst/localNotes.service': {
      localFoldersService: {
        delete: async (id) => {
          localDeletes.push(id)
        },
      },
    },
    '@/utils/supabaseFetchAll': { fetchAllRows: async () => [] },
  })
  const f = await attempt(() => foldersService.delete('offline-folder'))
  check(
    'R3.4 foldersService.delete (đã đăng nhập) cũng xóa bản local-first',
    f.ok &&
      cloudDeletes.some(([t, id]) => t === 'folders' && id === 'offline-folder') &&
      localDeletes.includes('offline-folder'),
    `ok=${f.ok} cloud=${JSON.stringify(cloudDeletes)} local=${JSON.stringify(localDeletes)}`,
  )
}

console.log('')
if (failures.length) {
  console.log(`RED — ${failures.length} check fail:`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('GREEN — S2C1.7 đạt.')
