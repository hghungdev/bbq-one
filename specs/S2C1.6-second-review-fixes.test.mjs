/**
 * FAILING TEST — S2C1.6: review độc lập LẦN 2 (chỉ nhắm commit S2C1.5 `ead5cf2`).
 *
 * Chạy:   node specs/S2C1.6-second-review-fixes.test.mjs   (Node ≥ 20 — WebCrypto thật)
 *
 * Cùng bộ dựng với S2C1.5 (code thật notes + accountCrypto + secureCache + accountSession +
 * sync.service; pinia giả có unwrap ref) + "cổng" chặn service để mô phỏng mạng chậm.
 *
 * RED trên 8366db7:
 *   - A: chưa biết trạng thái → S2C1.5 CHẶN ghi → user KHÔNG bật mã hóa mất quyền sửa khi Supabase
 *        trục trặc (khả dụng). Đúng: ghi được, GIỮ LẠI ở máy (không lên server).
 *   - B: mutation lấy key → chờ mạng → lockNow chạy xong → mutation ghi plaintext vào RAM → persist
 *        (hết key) ghi rõ xuống đĩa. Overlay giải mã đang dở lúc khóa cũng vậy.
 *   - C: xóa → logout / mất session → Undo khôi phục snapshot plaintext.
 *   - D: lockNow muộn của phiên cũ bỏ key của phiên MỚI; lockAccountNow có thể ném làm logout dừng.
 *   - E: không hỏi lại trạng thái định kỳ; "Already enabled" không làm mới trạng thái.
 * GREEN sau khi áp specs/S2C1.6-second-review-fixes.spec.md.
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
const net = { online: true, authed: true, userId: 'u1', row: null, deleteFails: false, statusFails: false, offlineNow: false }
/** Cổng chặn một lời gọi service (mô phỏng mạng chậm) — dùng một lần rồi tự gỡ. */
const gates = {}
async function passGate(name) {
  const g = gates[name]
  if (!g) return
  gates[name] = null
  await g
}
function makeGate() {
  let open
  const promise = new Promise((r) => (open = r))
  return { promise, open }
}
const localCreates = []
const serverWrites = []
const svcCalls = []
const userCryptoSvc = {
  fetchUserCryptoStatus: async () => {
    if (!net.online || net.statusFails) throw new Error('Failed to fetch')
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
    await passGate('noteCreate')
    if (!net.authed || net.offlineNow) throw notFoundLocal()
    const r = { id: 'n' + ctr++, user_id: 'u1', tags: [], ...i, updated_at: stamp(), synced_at: stamp() }
    serverWrites.push(['notes.create', r])
    return r
  },
  update: async (id, p, o) => {
    await passGate('noteUpdate')
    if (!net.authed || net.offlineNow) throw notFoundLocal()
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
    await passGate('bodyUpdate')
    if (!net.authed || net.offlineNow) throw notFoundLocal()
    serverWrites.push(['bodies.update', id, p])
    return { ...(o?.row ?? {}), ...p, id, updated_at: stamp(), synced_at: stamp() }
  },
  delete: async () => {},
  getAll: async () => [],
}
const localNotes = {
  localNotesService: {
    create: async (i) => {
      localCreates.push(i)
      return { id: 'L' + ctr++, tags: [], ...i, created_at: stamp(), updated_at: stamp() }
    },
  },
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
  '@/utils/noteSearch': loadTs('src/utils/noteSearch.ts', { '@/utils/text': loadTs('src/utils/text.ts') }), // P4: import mới của notes.ts
  '@/utils/rowsEqual': loadTs('src/utils/rowsEqual.ts'), // P5: import mới của notes.ts
}).useNotesStore

const PASS = 'passphrase đúng 10+'
const KP = { kdfParams: { iterations: 1_000 } }

/** Popup mới, account đã bật + mở khóa, 2 ghi chú bí mật trên đĩa (đã seal). */
async function setup() {
  localMem.clear()
  sessionMem.clear()
  resetStores()
  Object.assign(net, { online: true, authed: true, userId: 'u1', row: null, deleteFails: false, statusFails: false, offlineNow: false })
  localCreates.length = 0
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


const macro = () => new Promise((r) => setTimeout(r, 0))

// ═════════════════════════════════════════════════════════════════════════════
console.log('A — chưa biết trạng thái mã hóa: GHI ĐƯỢC nhưng giữ lại ở máy')
{
  // User KHÔNG bật mã hóa, đã đăng nhập; lần kiểm tra trạng thái lỗi, chưa có bản session.
  localMem.clear()
  sessionMem.clear()
  resetStores()
  Object.assign(net, { online: true, authed: true, userId: 'u1', row: null, statusFails: false, offlineNow: false })
  const acct0 = accountStore()
  await acct0.refreshStatus()
  const n0 = notesStore()
  await n0.createNote(null, 'ghi chú thường')
  const bodyId = n0.activeBodyId
  resetStores()
  sessionMem.clear()
  net.statusFails = true
  const acct = accountStore()
  await attempt(() => acct.refreshStatus())
  const notes = notesStore()
  await notes.hydrateFromCache()
  serverWrites.length = 0
  const u = await attempt(() => notes.updateBody(bodyId, { content: 'sửa lúc Supabase lỗi' }))
  const row = notes.bodies.find((b) => b.id === bodyId)
  check(
    'A1 chưa biết trạng thái → updateBody KHÔNG lỗi, nội dung giữ ở máy (dirty), KHÔNG gọi server',
    u.ok && row?.content === 'sửa lúc Supabase lỗi' && serverWrites.length === 0 && diskHas('sửa lúc Supabase lỗi'),
    `ok=${u.ok} (${u.msg}) content=${row?.content} server=${serverWrites.length}`,
  )
  localCreates.length = 0
  const c = await attempt(() => notes.createNote(null, 'tạo lúc Supabase lỗi'))
  check(
    'A2 chưa biết trạng thái → createNote KHÔNG lỗi, vào local-first (không gọi server)',
    c.ok && localCreates.length === 1 && !serverWrites.some((w) => w[0] === 'notes.create'),
    `ok=${c.ok} (${c.msg}) local=${localCreates.length}`,
  )
  net.statusFails = false
}
{
  // Account ĐÃ bật, chưa biết trạng thái (popup mới, lỗi mạng chập chờn) — không gì lên server dạng rõ.
  const { notes } = await setup()
  const bodyId = notes.activeBodyId
  resetStores()
  sessionMem.clear()
  net.statusFails = true
  const acct = accountStore()
  await attempt(() => acct.refreshStatus())
  const fresh = notesStore()
  await fresh.hydrateFromCache()
  serverWrites.length = 0
  await attempt(() => fresh.updateBody(bodyId, { content: 'CHƯA-BIẾT-TRẠNG-THÁI' }))
  check(
    'A3 account đã bật + chưa biết trạng thái → KHÔNG gửi plaintext lên server',
    !JSON.stringify(serverWrites).includes('CHƯA-BIẾT-TRẠNG-THÁI'),
    JSON.stringify(serverWrites).slice(0, 120),
  )
  net.statusFails = false
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nB — mutation / overlay đang chờ khi lockNow chạy xong')
async function raceMutationWithLock(gateName, mutate, offline = false) {
  const { acct, notes } = await setup()
  const g = makeGate()
  gates[gateName] = g.promise
  const p = mutate(notes)
  await macro()
  await acct.lockNow()
  if (offline) net.offlineNow = true
  g.open()
  const r = await attempt(() => p)
  net.offlineNow = false
  await notes.persistCache()
  return { acct, notes, r }
}
{
  const { notes, r } = await raceMutationWithLock('bodyUpdate', (n) => n.updateBody(n.activeBodyId, { content: 'GÕ-LÚC-KHÓA' }))
  const b = notes.bodies.find((x) => x.content?.includes?.('GÕ-LÚC-KHÓA'))
  check('B1 updateBody (online) xong SAU khi khóa → đĩa không plaintext, RAM không giữ bản rõ', r.ok && !diskHas('GÕ-LÚC-KHÓA') && !b, `ok=${r.ok} (${r.msg}) disk=${diskHas('GÕ-LÚC-KHÓA')} ram=${!!b}`)
}
{
  const { notes, r } = await raceMutationWithLock('bodyUpdate', (n) => n.updateBody(n.activeBodyId, { content: 'GÕ-OFFLINE-LÚC-KHÓA' }), true)
  check('B2 updateBody (offline) xong SAU khi khóa → đĩa không plaintext', r.ok && !diskHas('GÕ-OFFLINE-LÚC-KHÓA') && !notes.bodies.some((x) => x.content === 'GÕ-OFFLINE-LÚC-KHÓA'), `ok=${r.ok} (${r.msg}) disk=${diskHas('GÕ-OFFLINE-LÚC-KHÓA')}`)
}
{
  const { notes, r } = await raceMutationWithLock('noteUpdate', (n) => n.updateNote(n.notes[0].id, { title: 'ĐỔI-TÊN-LÚC-KHÓA' }))
  check('B3 updateNote xong SAU khi khóa → đĩa không plaintext (kể cả tiêu đề cũ)', r.ok && !diskHas('ĐỔI-TÊN-LÚC-KHÓA') && !diskHas('SECRET-TITLE'), `ok=${r.ok} (${r.msg}) new=${diskHas('ĐỔI-TÊN-LÚC-KHÓA')} old=${diskHas('SECRET-TITLE')}`)
  void notes
}
{
  const { r } = await raceMutationWithLock('noteCreate', (n) => n.createNote(null, 'TẠO-LÚC-KHÓA'))
  check('B4 createNote xong SAU khi khóa → đĩa không plaintext', r.ok && !diskHas('TẠO-LÚC-KHÓA'), `ok=${r.ok} (${r.msg}) disk=${diskHas('TẠO-LÚC-KHÓA')}`)
}
{
  // Overlay đang giải mã (lần decrypt đầu bị chặn) thì lockNow chạy xong.
  const { acct, notes } = await setup()
  const key = acct.getContentKey()
  const fresh = await secureCrypto.encryptFieldV2('OVERLAY-DANG-DO', key, 'k1') // envelope chưa có trong memo
  notes.notes = notes.notes.map((n, i) => (i === 0 ? { ...n, title: fresh } : n))
  const subtle = globalThis.crypto.subtle
  const realDecrypt = subtle.decrypt.bind(subtle)
  const g = makeGate()
  let gated = false
  subtle.decrypt = async (...a) => {
    if (!gated) {
      gated = true
      await g.promise
    }
    return realDecrypt(...a)
  }
  const overlay = acct.decryptLoadedAccountRows()
  await macro()
  await acct.lockNow()
  g.open()
  await overlay
  subtle.decrypt = realDecrypt
  await notes.persistCache()
  // Overlay dở dang chạy tiếp các row SAU (đã thành envelope sau khi khóa) — bắt mọi bí mật.
  const ramPlain = notes.notes.filter((n) => !secureCrypto.isEncryptedEnvelope(n.title)).map((n) => n.title)
  check(
    'B5 overlay xong SAU khi khóa → không gán bản rõ vào RAM, đĩa không plaintext',
    ramPlain.length === 0 && !diskHas('OVERLAY-DANG-DO') && !diskHas('SECRET'),
    `ramPlain=${JSON.stringify(ramPlain)} disk=${diskHas('OVERLAY-DANG-DO') || diskHas('SECRET')}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nC — Undo sau logout / mất session')
{
  const { acct, notes } = await setup()
  const target = notes.notes.find((n) => n.title === 'ALPHA-SECRET-TITLE')
  await notes.deleteNote(target.id)
  // Trình tự mất session: clearStatus + lockNow (thứ tự nào cũng phải an toàn)
  acct.clearStatus()
  await acct.lockNow({ clearSession: false })
  net.authed = false
  await undoCalls.at(-1).undo()
  check('C1 xóa → mất session → Undo: đĩa không có plaintext', !diskHas('ALPHA-SECRET'), 'Undo khôi phục snapshot plaintext')
  net.authed = true
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nD — lockNow muộn không được bỏ key của phiên mới')
{
  const { acct } = await setup()
  const g = makeGate()
  let held = false
  hooks.localGet = async () => {
    if (held) return
    held = true
    await g.promise // persist của lockNow treo
  }
  const lockP = acct.lockNow()
  await macro()
  // Trong lúc đó: lock() (vd logout) rồi mở khóa lại → key MỚI
  acct.lock()
  await acct.unlock(PASS)
  hooks.localGet = null
  g.open()
  await lockP
  check(
    'D1 lockNow của key cũ xong muộn → key mới + DEK session vẫn còn',
    acct.isUnlocked() && sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY),
    `unlocked=${acct.isUnlocked()} dek=${sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY)}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring')
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const setupModalSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'account', 'AccountEncryptionSetupModal.vue'), 'utf8')
const draftBody = extractFn(appSrc, 'maybeRestoreNoteDraft') ?? ''
check(
  'W1 maybeRestoreNoteDraft bỏ qua khi đã đăng nhập mà chưa biết trạng thái (draft là plaintext)',
  /isAuthenticated\.value && !account\.fetched\) return/.test(draftBody),
  draftBody.replace(/\s+/g, ' ').slice(0, 140),
)
check(
  'W2 biết trạng thái xong → đẩy mọi việc đang chờ (hasPendingSyncWork)',
  (extractFn(appSrc, 'refreshAccountCryptoStatus') ?? '').includes('hasPendingSyncWork()'),
  'dirty row giữ lại lúc chưa biết trạng thái không ai đẩy',
)
const mountBody = appSrc.slice(appSrc.indexOf('onMounted(async'), appSrc.indexOf('onUnmounted('))
check(
  'W3 hỏi lại trạng thái định kỳ (setInterval + statusAgeMs) — tab mở lâu / bật ở máy khác',
  /setInterval\([\s\S]{0,300}statusAgeMs\(\)/.test(mountBody) && appSrc.includes('clearInterval(accountStatusTimer)'),
  'chỉ hỏi lại khi refreshStoresFromNetwork chạy',
)
const lockBody = extractFn(appSrc, 'lockAccountNow') ?? ''
check(
  'W4 lockAccountNow không bao giờ ném (try/catch quanh lockNow + overlay secure folder)',
  /try \{\s*await account\.lockNow\(/.test(lockBody) && /try \{\s*await secure\.decryptLoadedSecureRows\(\)/.test(lockBody),
  lockBody.replace(/\s+/g, ' ').slice(0, 160),
)
const watchStart = appSrc.indexOf('watch(isAuthenticated,')
const watchBlock = appSrc.slice(watchStart, appSrc.indexOf('\n  })', watchStart))
// Khóa TRƯỚC (còn key → flush editor / persist đều mã hóa), rồi mới quên trạng thái — và chỉ khi
// chưa ai đăng nhập lại (clearStatus muộn không được xóa trạng thái của phiên mới). Xóa trạng thái
// trước thì flush coi như "account không mã hóa" → gửi bản rõ trong request lên server.
check(
  'W5 mất session: lockAccountNow TRƯỚC clearStatus, clearStatus chỉ khi vẫn chưa đăng nhập lại',
  watchBlock.indexOf('lockAccountNow(') !== -1 &&
    watchBlock.indexOf('lockAccountNow(') < watchBlock.indexOf('account.clearStatus()') &&
    /if \(!isAuthenticated\.value\) account\.clearStatus\(\)/.test(watchBlock),
  watchBlock.replace(/\s+/g, ' ').slice(0, 200),
)
const logoutBody = extractFn(appSrc, 'onLogout') ?? ''
check(
  'W6 onLogout chốt các xóa đang chờ Undo (commitAllPending) TRƯỚC auth.logout',
  logoutBody.includes('commitAllPending()') && logoutBody.indexOf('commitAllPending()') < logoutBody.indexOf('auth.logout()'),
  logoutBody.replace(/\s+/g, ' ').slice(0, 160),
)
check(
  'W7 "Already enabled" (bật ở máy khác) → làm mới trạng thái',
  setupModalSrc.includes("'Already enabled'") && setupModalSrc.includes('refreshStatus()'),
  'context này vẫn tưởng chưa bật',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2C1.6-second-review-fixes.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2C1.6 đúng spec.')
