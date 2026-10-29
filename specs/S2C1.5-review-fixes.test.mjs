/**
 * FAILING TEST — S2C1.5: vá 8 lỗi từ review bảo mật độc lập đợt S2C1.2 → S2C1.4.
 *
 * Chạy:   node specs/S2C1.5-review-fixes.test.mjs   (Node ≥ 20 — WebCrypto thật)
 *
 * Nạp CODE THẬT stores/notes.ts + stores/accountCrypto.ts + utils/secureCache.ts +
 * utils/accountSession.ts + services/sync.service.ts; pinia giả có unwrap ref + store singleton
 * (dựng theo harness của reviewer). chrome.storage giả tách session / local.
 *
 * RED trên f3ec132: R1 (draft → server plaintext), R2 (mất session / persist chen giữa lúc khóa →
 * đĩa plaintext), R3 (Undo sau khóa → đĩa plaintext), R5 (row hỏng chặn khóa), R6 (bật mã hóa khi
 * chưa biết trạng thái), R7 (đua restore ↔ khóa), + wiring.
 * GREEN sau khi áp specs/S2C1.5-review-fixes.spec.md.
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

function extractFn(src, fnName) {
  const start = src.indexOf(`function ${fnName}(`)
  if (start === -1) return null
  let depth = 0
  let i = src.indexOf('{\n', start)
  const bodyStart = i
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(bodyStart, i + 1)
    }
  }
  return null
}

// ── chrome giả ──────────────────────────────────────────────────────────────
const sessionMem = new Map()
const localMem = new Map()
const hooks = { localGet: null, sessionGet: null }
function area(mem, hookName) {
  return {
    get: async (k) => {
      const keys = k == null ? [...mem.keys()] : Array.isArray(k) ? k : [k]
      if (hooks[hookName]) await hooks[hookName](keys)
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
  storage: { session: area(sessionMem, 'sessionGet'), local: area(localMem, 'localGet') },
  alarms: { create: () => {} },
}
const diskHas = (needle) => JSON.stringify([...localMem.entries()]).includes(needle)

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

// ── server giả ──────────────────────────────────────────────────────────────
const net = { online: true, authed: true, userId: 'u1', row: null, deleteFails: false }
const serverWrites = []
const svcCalls = []
const userCryptoSvc = {
  fetchUserCryptoStatus: async () => {
    if (!net.online) throw new Error('Failed to fetch')
    return net.authed ? { userId: net.userId, row: net.row && { ...net.row } } : null
  },
  fetchUserCryptoRow: async () => (net.row ? { ...net.row } : null),
  upsertUserCryptoRow: async (r, opts) => {
    svcCalls.push({ op: 'upsert', opts })
    net.row = { ...r }
  },
}
let ctr = 0
const stamp = () => new Date(Date.now() + ctr++).toISOString()
const notFoundLocal = () => Object.assign(new Error('offline'), { network: true })
const notesService = {
  create: async (i) => {
    if (!net.authed) throw notFoundLocal()
    const r = { id: 'n' + ctr++, user_id: 'u1', tags: [], ...i, updated_at: stamp(), synced_at: stamp() }
    serverWrites.push(['notes.create', r])
    return r
  },
  update: async (id, p, o) => {
    if (!net.authed) throw notFoundLocal()
    serverWrites.push(['notes.update', id, p])
    return { ...(o?.row ?? {}), ...p, id, updated_at: stamp(), synced_at: stamp() }
  },
  delete: async () => {
    if (net.deleteFails) throw new Error('PGRST: delete rejected')
  },
  getAll: async () => [],
  searchFullText: async () => [],
}
const noteBodiesService = {
  create: async (nid, r) => {
    if (!net.authed) throw notFoundLocal()
    const row = { id: 'b' + ctr++, note_id: nid, user_id: 'u1', ...r, updated_at: stamp(), synced_at: stamp() }
    serverWrites.push(['bodies.create', row])
    return row
  },
  update: async (id, p, o) => {
    if (!net.authed) throw notFoundLocal()
    serverWrites.push(['bodies.update', id, p])
    return { ...(o?.row ?? {}), ...p, id, updated_at: stamp(), synced_at: stamp() }
  },
  delete: async () => {},
  getAll: async () => [],
}
const localNotes = {
  localNotesService: { create: async (i) => ({ id: 'L' + ctr++, tags: [], ...i, created_at: stamp(), updated_at: stamp() }) },
  localNoteBodiesService: {
    create: async (nid, r) => ({ id: 'LB' + ctr++, note_id: nid, ...r, created_at: stamp(), updated_at: stamp() }),
  },
}
const undoCalls = []
const syncSvc = loadTs('src/services/sync.service.ts', {
  '@/constants/storage': storageConsts,
  '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'cal' },
  '@/utils/secureCrypto': secureCrypto,
  './calendarEvents.service': { calendarEventsService: {} },
  './noteBodies.service': { noteBodiesService },
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
  '@/services/noteBodies.service': { noteBodiesService },
  '@/services/notes.service': { notesService, filterNotesBySubstring: () => [] },
  '@/services/localFirst/localNotes.service': localNotes,
  '@/stores/folders': { useFoldersStore: () => ({ folders: [], isSecureFolder: () => false }) },
  '@/stores/secureFolder': { useSecureFolderStore: () => ({ getKey: () => null, decryptLoadedSecureRows: async () => {} }) },
  '@/stores/accountCrypto': { useAccountCryptoStore: () => accountStore() },
  '@/stores/auth': { useAuthStore: () => ({ isAuthenticated: net.authed }) },
  '@/utils/secureCrypto': secureCrypto,
  '@/utils/withTimeout': { withTimeout: (p) => p },
  '@/utils/networkErrors': { isNetworkError: (e) => e?.network === true },
  '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => stamp() },
  '@/services/autoSync.service': { scheduleAutoSync: () => {} },
  '@/services/networkReachability.service': { isOnline: () => net.online },
  '@/services/sync.service': syncSvc,
  '@/stores/undoToast': { useUndoToastStore: () => ({ schedule: async (a) => undoCalls.push(a) }) },
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

const PASS = 'passphrase đúng 10+'
const KP = { kdfParams: { iterations: 1_000 } }

/** Popup mới, account đã bật + mở khóa, 2 ghi chú bí mật trên đĩa (đã seal). */
async function setup() {
  localMem.clear()
  sessionMem.clear()
  resetStores()
  Object.assign(net, { online: true, authed: true, userId: 'u1', row: null, deleteFails: false })
  serverWrites.length = 0
  undoCalls.length = 0
  hooks.localGet = null
  hooks.sessionGet = null
  const acct = accountStore()
  await acct.refreshStatus()
  await acct.enableAccountEncryption(PASS, KP)
  const notes = notesStore()
  await notes.createNote(null, 'ALPHA-SECRET-TITLE')
  await notes.updateBody(notes.activeBodyId, { content: 'ALPHA-SECRET-BODY' })
  await notes.createNote(null, 'BETA-SECRET-TITLE')
  return { acct, notes }
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('R0 — tiền đề')
{
  await setup()
  check('R0 đã mở khóa: đĩa + server không có plaintext', !diskHas('SECRET') && !JSON.stringify(serverWrites).includes('SECRET'), 'setup rò rỉ')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nR1 — #1 ghi TRƯỚC khi biết trạng thái mã hóa (draft restore lúc mở popup) phải fail-closed')
{
  const { notes } = await setup()
  const bodyId = notes.activeBodyId
  resetStores() // popup đóng → mở lại: store mới, chưa refreshStatus
  const fresh = notesStore()
  await fresh.hydrateFromCache()
  const before = serverWrites.length
  const r = await attempt(() => fresh.updateBody(bodyId, { content: 'DRAFT-SECRET' }))
  const sent = JSON.stringify(serverWrites.slice(before))
  // S2C1.6 (review lần 2): CHẶN ghi làm user không bật mã hóa mất quyền sửa khi Supabase trục trặc
  // → đổi thành GIỮ LẠI ở máy (không lên server). Draft (plaintext) thì App.vue không áp khi chưa
  // biết trạng thái — xem S2C1.6 W1.
  check(
    'R1.1 đăng nhập + chưa biết trạng thái → KHÔNG gửi lên server (giữ lại ở máy)',
    !sent.includes('DRAFT-SECRET'),
    `ok=${r.ok} sent=${sent.slice(0, 80)}`,
  )
}
{
  localMem.clear()
  sessionMem.clear()
  resetStores()
  net.authed = false
  const local = notesStore()
  const r = await attempt(() => local.createNote(null, 'ghi chú local'))
  check('R1.2 local mode (chưa đăng nhập) vẫn tạo ghi chú được', r.ok, r.msg)
  net.authed = true
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nR2 — #2 khóa / mất session: RAM phải về envelope TRƯỚC khi quên trạng thái')
{
  const { acct, notes } = await setup()
  // Trình tự App.vue khi mất session ngoài onLogout (sau fix): lockNow → lock → clearStatus
  await acct.lockNow({ clearSession: false })
  acct.lock()
  acct.clearStatus()
  net.authed = false
  await notes.createNote(null, 'ghi chú local sau khi mất session')
  check(
    'R2.1 mất session → local mode ghi tiếp: đĩa không có plaintext của account',
    !diskHas('ALPHA-SECRET') && !diskHas('BETA-SECRET'),
    `ALPHA=${diskHas('ALPHA-SECRET')} BETA=${diskHas('BETA-SECRET')}`,
  )
}
{
  const { acct, notes } = await setup()
  // persistCache chen vào giữa lockNow (đúng lúc lockNow nạp lại RAM từ đĩa) — vd autosave/loadAll.
  let racing = null
  let fired = false
  hooks.localGet = async (keys) => {
    if (fired || acct.isUnlocked()) return
    if (!keys.includes(storageConsts.NOTES_CACHE_KEY)) return
    fired = true // đặt TRƯỚC khi gọi — persistCache đọc storage ngay lập tức (tránh đệ quy)
    racing = notes.persistCache()
    // Đĩa chậm: bước nạp lại của lockNow treo 30 ms — đủ cho persist chen vào chạy hết nếu không
    // có hàng đợi. Có hàng đợi thì persist chờ, không deadlock (chỉ là timeout cố định).
    await new Promise((r) => setTimeout(r, 30))
  }
  await acct.lockNow()
  hooks.localGet = null
  await racing
  await notes.persistCache()
  check(
    'R2.2 persistCache chen giữa lúc khóa → đĩa vẫn không có plaintext',
    !diskHas('ALPHA-SECRET') && !diskHas('BETA-SECRET'),
    `ALPHA=${diskHas('ALPHA-SECRET')} BETA=${diskHas('BETA-SECRET')}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nR3 — #3 Undo xóa ghi chú sau khi đã khóa')
{
  const { acct, notes } = await setup()
  const target = notes.notes.find((n) => n.title === 'ALPHA-SECRET-TITLE')
  await notes.deleteNote(target.id)
  await acct.lockNow()
  await undoCalls.at(-1).undo()
  check('R3.1 Undo lúc đã khóa → đĩa không có plaintext', !diskHas('ALPHA-SECRET'), 'Undo ghi lại snapshot plaintext')
  const back = notes.notes.find((n) => n.id === target.id)
  check('R3.2 ghi chú vẫn quay lại (không mất dữ liệu), dạng envelope', !!back && secureCrypto.isEncryptedEnvelope(back.title), JSON.stringify(back?.title))
  await acct.unlock(PASS)
  await notes.persistCache()
  check(
    'R3.3 mở khóa lại → đọc được nội dung gốc',
    notes.notes.find((n) => n.id === target.id)?.title === 'ALPHA-SECRET-TITLE' &&
      notes.bodies.some((b) => b.note_id === target.id && b.content === 'ALPHA-SECRET-BODY'),
    JSON.stringify(notes.notes.find((n) => n.id === target.id)?.title),
  )
}
{
  const { acct, notes } = await setup()
  const target = notes.notes.find((n) => n.title === 'ALPHA-SECRET-TITLE')
  await notes.deleteNote(target.id)
  await acct.lockNow()
  net.deleteFails = true
  await undoCalls.at(-1).commit()
  check('R3.4 commit xóa thất bại lúc đã khóa → khôi phục không ghi plaintext', !diskHas('ALPHA-SECRET'), 'nhánh commit-fail ghi plaintext')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nR4 — #4 trạng thái cũ phải được hỏi lại')
{
  const { acct } = await setup()
  check(
    'R4.1 store có statusAgeMs(): vừa kiểm tra → nhỏ; chưa kiểm tra → Infinity',
    typeof acct.statusAgeMs === 'function' && acct.statusAgeMs() < 5_000 && (() => {
      acct.clearStatus()
      return acct.statusAgeMs() === Infinity
    })(),
    `typeof=${typeof acct.statusAgeMs}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nR5 — #5 một row không giải mã được không được chặn persist / khóa')
{
  const { acct, notes } = await setup()
  const good = await secureCrypto.encryptFieldV2('x', acct.getContentKey(), 'k1')
  const tampered = good.slice(0, -6) + (good.slice(-6, -2) === 'AAAA' ? 'BBBB' : 'AAAA') + good.slice(-2)
  const t0 = new Date().toISOString()
  notes.notes = [...notes.notes, { id: 'evil', folder_id: null, tags: [], title: tampered, updated_at: t0, synced_at: t0 }]
  const p = await attempt(() => notes.persistCache())
  check('R5.1 persistCache không ném vì 1 row hỏng (row đó giữ envelope)', p.ok, p.msg)
  const l = await attempt(() => acct.lockNow())
  check(
    'R5.2 lockNow vẫn khóa: hết key, DEK rời session',
    l.ok && !acct.isUnlocked() && !sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY),
    `ok=${l.ok} (${l.msg}) unlocked=${acct.isUnlocked()} dek=${sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY)}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nR6 — #6 bật mã hóa khi CHƯA xác nhận được trạng thái = có thể ghi đè DEK cũ')
{
  localMem.clear()
  sessionMem.clear()
  resetStores()
  svcCalls.length = 0
  Object.assign(net, { online: true, authed: true, row: null })
  const a = accountStore()
  const r = await attempt(() => a.enableAccountEncryption(PASS, KP))
  check('R6.1 chưa refreshStatus → enable bị từ chối, không ghi server', !r.ok && svcCalls.length === 0, `ok=${r.ok} calls=${svcCalls.length}`)
}
{
  const { acct } = await setup()
  const first = { ...net.row }
  resetStores()
  net.online = false
  const off = accountStore()
  await off.refreshStatus() // bản session → stale
  off.clearStatus()
  sessionMem.set(S.ACCOUNT_STATUS_SESSION_KEY, { userId: 'u1', row: null }) // bản session cũ: "chưa bật"
  await off.refreshStatus()
  svcCalls.length = 0
  const r = await attempt(() => off.enableAccountEncryption(PASS, KP))
  check(
    'R6.2 trạng thái chỉ từ bản session (stale) → enable bị từ chối, wrapped_dek cũ còn nguyên',
    !r.ok && net.row.wrapped_dek === first.wrapped_dek,
    `ok=${r.ok} overwritten=${net.row.wrapped_dek !== first.wrapped_dek}`,
  )
  net.online = true
  void acct
}
{
  await setup()
  check(
    'R6.3 enable ghi bằng insert-only (mustNotExist) — đụng row có sẵn thì lỗi, không đè',
    svcCalls.some((c) => c.op === 'upsert' && c.opts?.mustNotExist === true),
    JSON.stringify(svcCalls),
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nR7 — #7 đua restoreFromSession ↔ context khác khóa')
{
  await setup()
  resetStores()
  const p = accountStore()
  await p.refreshStatus()
  hooks.sessionGet = async (keys) => {
    if (keys.includes(S.ACCOUNT_DEK_EXTENDED_SESSION_KEY)) {
      hooks.sessionGet = null
      await S.clearSessionDek() // tab khác bấm "Khóa ngay" đúng lúc popup đang restore
    }
  }
  await p.restoreFromSession()
  hooks.sessionGet = null
  check(
    'R7.1 DEK bị xóa giữa chừng → popup KHÔNG ở trạng thái mở khóa mà không còn DEK',
    !(p.isUnlocked() && !sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY)),
    `unlocked=${p.isUnlocked()} dek=${sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY)}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring')
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const notesSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'notes.ts'), 'utf8')
const syncStoreSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'sync.ts'), 'utf8')
const settingsSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'layout', 'SettingsModal.vue'), 'utf8')
const svcSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'userCrypto.service.ts'), 'utf8')

const mountBody = appSrc.slice(appSrc.indexOf('onMounted(async'), appSrc.indexOf('onUnmounted('))
check(
  'W1 onMounted: refreshAccountCryptoStatus TRƯỚC maybeRestoreNoteDraft; mở khóa xong thử lại draft',
  mountBody.indexOf('await refreshAccountCryptoStatus()') !== -1 &&
    mountBody.indexOf('await refreshAccountCryptoStatus()') < mountBody.indexOf('maybeRestoreNoteDraft()') &&
    (extractFn(appSrc, 'onAccountUnlocked') ?? '').includes('maybeRestoreNoteDraft()'),
  'draft vẫn được áp trước khi biết trạng thái mã hóa',
)
const watchStart = appSrc.indexOf('watch(isAuthenticated,')
const watchBlock = appSrc.slice(watchStart, appSrc.indexOf('\n  })', watchStart))
const logoutBody = extractFn(appSrc, 'onLogout') ?? ''
// S2C1.6: ở nhánh mất session, clearStatus đồng bộ TRƯỚC rồi mới lockAccountNow (lockNow chỉ cần
// key, vẫn còn) — tránh clearStatus muộn xóa trạng thái của lần đăng nhập mới. onLogout giữ thứ tự cũ.
check(
  'W2 mất session (watch) gọi cả lockAccountNow + clearStatus; onLogout: lockAccountNow TRƯỚC clearStatus',
  watchBlock.includes('lockAccountNow(') &&
    watchBlock.includes('clearStatus()') &&
    logoutBody.includes('lockAccountNow(') &&
    logoutBody.indexOf('lockAccountNow(') < logoutBody.indexOf('clearStatus()'),
  `watch=${watchBlock.replace(/\s+/g, ' ').slice(0, 120)}`,
)
check(
  'W3 persistCache tuần tự (runPersistExclusive) — lockNow chạy trong cùng hàng đợi',
  notesSrc.includes('runPersistExclusive(') && notesSrc.includes('sealThenReloadExclusive'),
  'persistCache vẫn có thể chen giữa seal → bỏ key → nạp lại',
)
check(
  'W4 trạng thái cũ hơn ngưỡng → hỏi lại (App.vue refreshStoresFromNetwork + sync tay)',
  (extractFn(appSrc, 'refreshStoresFromNetwork') ?? '').includes('statusAgeMs()') &&
    (extractFn(syncStoreSrc, 'runManualSync') ?? '').includes('statusAgeMs()'),
  'bật mã hóa ở nơi khác không tới được context đang mở',
)
const changedBody = extractFn(appSrc, 'onAccountSessionChanged') ?? ''
check(
  'W5 onAccountSessionChanged nghe cả ACCOUNT_STATUS_SESSION_KEY (bật mã hóa ở popup → tab biết ngay)',
  changedBody.includes('ACCOUNT_STATUS_SESSION_KEY'),
  changedBody.replace(/\s+/g, ' ').slice(0, 120),
)
check(
  'W6 Settings chỉ cho "Bật mã hóa" khi trạng thái đã xác nhận (fetched && !stale)',
  /accountCrypto\.fetched/.test(settingsSrc) && /accountCrypto\.stale/.test(settingsSrc),
  'nút Bật hiện cả khi không kiểm tra được trạng thái',
)
check(
  'W7 service: mustNotExist → insert (không upsert đè), 23505 → "Already enabled"',
  svcSrc.includes('mustNotExist') && svcSrc.includes('.insert(') && svcSrc.includes('23505'),
  'enable vẫn upsert đè row cũ',
)
const lockBody = extractFn(appSrc, 'lockAccountNow') ?? ''
check(
  'W8 lockAccountNow: khóa xong mở lại secure folder đang unlock (decryptLoadedSecureRows)',
  lockBody.includes('decryptLoadedSecureRows()') &&
    lockBody.indexOf('account.lockNow(') < lockBody.indexOf('decryptLoadedSecureRows()'),
  'secure folder đang mở biến thành envelope sau Khóa ngay',
)
check(
  'W9 xóa ghi chú gia hạn tự khóa (markActivity) — Undo 5 s không bị tự khóa cắt ngang',
  (extractFn(notesSrc, 'scheduleDeleteNote') ?? '').includes('markActivity()'),
  'xóa không tính là thao tác',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2C1.5-review-fixes.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2C1.5 đúng spec.')
