/**
 * FAILING TEST — S2C1.3: khóa theo phiên trình duyệt (chrome.storage.session) + mở khóa offline.
 *
 * Chạy:   node specs/S2C1.3-session-key-offline-unlock.test.mjs   (Node ≥ 20 — WebCrypto thật)
 *
 * chrome.storage giả (session + local tách riêng) để kiểm chứng BẤT BIẾN: không gì xuống local.
 *
 * RED trên 347b7a0:
 *   - T1 fail: src/utils/accountSession.ts chưa tồn tại.
 *   - T2 fail: store không ghi/đọc session → mở lại popup phải gõ passphrase; offline không unlock.
 *   - W  fail: App.vue/Settings/background chưa wiring (restore, đồng bộ khóa, Khóa ngay, alarm).
 * GREEN sau khi áp specs/S2C1.3-session-key-offline-unlock.spec.md.
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

async function throws(fn) {
  try {
    await fn()
    return { threw: false, msg: '(không throw)' }
  } catch (e) {
    return { threw: true, msg: e instanceof Error ? e.message : String(e) }
  }
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

/** Thân hàm — bỏ qua `{` trong kiểu tham số / kiểu trả về (thân luôn mở bằng `{` cuối dòng). */
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

// ── chrome giả: session + local là hai vùng RIÊNG ──────────────────────────────
const sessionMem = new Map()
const localMem = new Map()
const alarms = []
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
  alarms: {
    create: (name, info) => {
      alarms.push({ name, ...info })
    },
  },
}

const secureCrypto = loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCrypto.ts'), {})
const acctUtils = loadTsModule(path.join(ROOT, 'src', 'utils', 'accountCrypto.ts'), {
  '@/utils/secureCrypto': secureCrypto,
})
const cacheMod = loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCache.ts'), {
  '@/utils/secureCrypto': secureCrypto,
})

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — utils/accountSession.ts (CODE THẬT)')

let S = null
try {
  S = loadTsModule(path.join(ROOT, 'src', 'utils', 'accountSession.ts'), {
    '@/utils/accountCrypto': acctUtils,
    '@/utils/secureCrypto': secureCrypto,
  })
  check('T1.0 file tồn tại + export đủ API', typeof S.resolveAccountForPush === 'function' && typeof S.writeSessionDek === 'function', 'thiếu export')
} catch (e) {
  check('T1.0 file src/utils/accountSession.ts tồn tại và load được', false, e.message)
}

const ROW = {
  kdf: 'pbkdf2-sha256',
  kdf_params: { iterations: 1_000 },
  kdf_salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  dek_id: 'k1',
  wrapped_dek: 'bbq:2:A256GCM:k1:x:y',
  wrapped_dek_recovery: null,
  verifier: 'bbq:2:A256GCM:kek:x:y',
}

if (S) {
  const dek = acctUtils.generateDekBytes()
  await S.writeSessionDek('u1', 'k1', dek)
  const entry = sessionMem.get(S.ACCOUNT_DEK_SESSION_KEY)
  check(
    'T1.1 writeSessionDek → chrome.storage.session, hạn ~30 phút, có alarm tự khóa',
    entry?.userId === 'u1' &&
      entry.expiresAt > Date.now() + 29 * 60_000 &&
      alarms.some((a) => a.name === S.ACCOUNT_AUTOLOCK_ALARM && a.when === entry.expiresAt),
    JSON.stringify({ entry: entry && { ...entry, dekB64: '…' }, alarms }),
  )

  const back = await S.readSessionDek()
  check(
    'T1.2 readSessionDek trả đúng DEK',
    back !== null && Buffer.from(back.dek).equals(Buffer.from(dek)) && back.dekId === 'k1',
    JSON.stringify(back && { ...back, dek: back.dek.length }),
  )

  // Gần hết hạn → touch gia hạn: DEK vẫn đọc được sau mốc hạn gốc.
  sessionMem.set(S.ACCOUNT_DEK_SESSION_KEY, { ...entry, expiresAt: Date.now() + 1_000 })
  await S.touchSessionDek()
  sessionMem.set(S.ACCOUNT_DEK_SESSION_KEY, { ...sessionMem.get(S.ACCOUNT_DEK_SESSION_KEY), expiresAt: Date.now() - 1 })
  check(
    'T1.3 touchSessionDek gia hạn thêm 30 phút (qua mốc hạn gốc vẫn còn hiệu lực)',
    (await S.readSessionDek()) !== null,
    'gia hạn không có tác dụng',
  )

  // Touch chạy đua với "Khóa ngay": DEK đã xóa KHÔNG được sống lại.
  await S.writeSessionDek('u1', 'k1', dek)
  const racingTouch = S.touchSessionDek()
  await S.clearSessionDek()
  await racingTouch
  check(
    'T1.3b touch đua với clearSessionDek → DEK không hồi sinh',
    !sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY) && (await S.readSessionDek()) === null,
    `keys=${JSON.stringify([...sessionMem.keys()])}`,
  )

  await S.writeSessionDek('u1', 'k1', dek)
  sessionMem.set(S.ACCOUNT_DEK_SESSION_KEY, { ...sessionMem.get(S.ACCOUNT_DEK_SESSION_KEY), expiresAt: Date.now() - 1 })
  const expired = await S.readSessionDek()
  check(
    'T1.4 DEK hết hạn → null và bị xóa khỏi session',
    expired === null && !sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY),
    `expired=${JSON.stringify(expired)} còn=${sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY)}`,
  )

  await S.writeSessionDek('u1', 'k1', dek)
  await S.purgeExpiredSessionDek()
  const keptByPurge = sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY)
  sessionMem.set(S.ACCOUNT_DEK_SESSION_KEY, { ...sessionMem.get(S.ACCOUNT_DEK_SESSION_KEY), expiresAt: Date.now() - 1 })
  await S.purgeExpiredSessionDek()
  check(
    'T1.5 alarm purge: còn hạn → giữ; hết hạn → xóa',
    keptByPurge && !sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY),
    `kept=${keptByPurge} after=${sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY)}`,
  )

  // resolveAccountForPush — đường push của SW / local-first
  sessionMem.clear()
  const unknown = await S.resolveAccountForPush('u1')
  await S.writeAccountStatus('u2', ROW)
  const otherUser = await S.resolveAccountForPush('u1')
  await S.writeAccountStatus('u1', null)
  const off = await S.resolveAccountForPush('u1')
  await S.writeAccountStatus('u1', ROW)
  const locked = await S.resolveAccountForPush('u1')
  await S.writeSessionDek('u2', 'k1', dek)
  const foreignDek = await S.resolveAccountForPush('u1')
  await S.writeSessionDek('u1', 'k1', dek)
  const open = await S.resolveAccountForPush('u1')
  let decryptsOk = false
  if (open?.key) {
    const env = await secureCrypto.encryptFieldV2('xin chào', await acctUtils.deriveContentKey(dek), 'k1')
    decryptsOk = (await secureCrypto.decryptField(env, open.key)) === 'xin chào'
  }
  check('T1.6 chưa biết trạng thái → fail-closed {key:null}', unknown?.key === null, JSON.stringify(unknown))
  check('T1.7 trạng thái của user khác → fail-closed', otherUser?.key === null, JSON.stringify(otherUser))
  check('T1.8 user chưa bật mã hóa → null (push như cũ)', off === null, JSON.stringify(off))
  check('T1.9 bật nhưng chưa mở khóa → {key:null, kid}', locked?.key === null && locked?.kid === 'k1', JSON.stringify(locked))
  check('T1.10 DEK trong session của user khác → không dùng', foreignDek?.key === null, JSON.stringify(foreignDek))
  check('T1.11 bật + DEK hợp lệ → key giải mã được dữ liệu account', decryptsOk, `open=${JSON.stringify(open && { kid: open.kid })}`)

  await S.clearAccountSession()
  check(
    'T1.12 clearAccountSession xóa cả status lẫn DEK',
    !sessionMem.has(S.ACCOUNT_STATUS_SESSION_KEY) && !sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY),
    JSON.stringify([...sessionMem.keys()]),
  )
}

const sessionSrc = (() => {
  try {
    return fs.readFileSync(path.join(ROOT, 'src', 'utils', 'accountSession.ts'), 'utf8')
  } catch {
    return ''
  }
})()
check(
  'T1.13 BẤT BIẾN tĩnh: accountSession.ts không đụng chrome.storage.local',
  sessionSrc !== '' && !sessionSrc.includes('storage.local.') && !sessionSrc.includes("storage['local']"),
  'DEK / wrapped_dek KHÔNG được xuống đĩa',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — stores/accountCrypto.ts + session (CODE THẬT, crypto thật)')

const vueMock = {
  ref: (v) => ({ value: v }),
  shallowRef: (v) => ({ value: v }),
  computed: (fn) => ({
    get value() {
      return fn()
    },
  }),
}
const piniaMock = { defineStore: (_name, setup) => setup }
const net = { online: true, row: null, userId: 'u1' }
const svcMock = {
  fetchUserCryptoStatus: async () => {
    if (!net.online) throw new Error('Failed to fetch')
    return { userId: net.userId, row: net.row ? { ...net.row } : null }
  },
  fetchUserCryptoRow: async () => {
    if (!net.online) throw new Error('Failed to fetch')
    return net.row ? { ...net.row } : null
  },
  upsertUserCryptoRow: async (r) => {
    net.row = { ...r }
  },
}
const notesLog = []
let storeCtx = null
const notesMock = {
  notes: [],
  bodies: [],
  persistCache: async () => {
    notesLog.push(`persist(unlocked=${storeCtx?.isUnlocked()})`)
  },
  hydrateFromCache: async () => {
    notesLog.push(`hydrate(unlocked=${storeCtx?.isUnlocked()})`)
  },
}

let Store = null
if (S) {
  try {
    Store = loadTsModule(path.join(ROOT, 'src', 'stores', 'accountCrypto.ts'), {
      pinia: piniaMock,
      vue: vueMock,
      '@/utils/accountCrypto': acctUtils,
      '@/utils/secureCrypto': secureCrypto,
      '@/utils/secureCache': cacheMod,
      '@/utils/accountSession': S,
      '@/services/userCrypto.service': svcMock,
      '@/stores/notes': { useNotesStore: () => notesMock },
    }).useAccountCryptoStore
  } catch (e) {
    check('T2.0 store load được với accountSession', false, e.message)
  }
}

const PASS = 'passphrase đúng 10+'
const KP = { kdfParams: { iterations: 1_000 } }

if (Store) {
  sessionMem.clear()
  const popup1 = Store()
  await popup1.refreshStatus()
  await popup1.enableAccountEncryption(PASS, KP)
  const env = await secureCrypto.encryptFieldV2('bí mật', popup1.getContentKey(), 'k1')
  check(
    'T2.1 bật mã hóa → status + DEK nằm trong session (không có gì ở local)',
    sessionMem.has(S.ACCOUNT_STATUS_SESSION_KEY) && sessionMem.has(S.ACCOUNT_DEK_SESSION_KEY) && localMem.size === 0,
    `session=${JSON.stringify([...sessionMem.keys()])} local=${localMem.size}`,
  )

  // Popup đóng → mở lại: store mới, RAM trống.
  const popup2 = Store()
  await popup2.refreshStatus()
  const restored = typeof popup2.restoreFromSession === 'function' ? await popup2.restoreFromSession() : false
  let readable = false
  if (restored) readable = (await secureCrypto.decryptField(env, popup2.getContentKey())) === 'bí mật'
  check(
    'T2.2 mở lại popup → restoreFromSession mở khóa KHÔNG cần passphrase',
    restored && popup2.isUnlocked() && readable,
    `restored=${restored} unlocked=${popup2.isUnlocked()} readable=${readable}`,
  )

  // Offline: server không trả lời.
  net.online = false
  const offline1 = Store()
  const r1 = await throws(() => offline1.refreshStatus())
  check(
    'T2.3 offline → trạng thái lấy từ bản session (isEnabled, stale), không throw',
    !r1.threw && offline1.isEnabled() && offline1.stale?.value === true,
    `threw=${r1.threw} (${r1.msg}) enabled=${offline1.isEnabled()} stale=${offline1.stale?.value}`,
  )
  const offRestore = typeof offline1.restoreFromSession === 'function' ? await offline1.restoreFromSession() : false
  check('T2.4 offline + DEK còn hạn → mở khóa im lặng', offRestore && offline1.isUnlocked(), `restore=${offRestore}`)

  // Offline + DEK đã hết hạn → phải gõ passphrase, và gõ được (row lấy từ session).
  if (S) await S.clearSessionDek()
  const offline2 = Store()
  await offline2.refreshStatus().catch(() => {})
  const noDek = typeof offline2.restoreFromSession === 'function' ? await offline2.restoreFromSession() : false
  const u = await throws(() => offline2.unlock(PASS))
  check(
    'T2.5 offline + hết hạn → không tự mở; gõ passphrase mở được (row từ session)',
    !noDek && !u.threw && offline2.isUnlocked() && sessionMem.has(S?.ACCOUNT_DEK_SESSION_KEY),
    `noDek=${noDek} unlockThrew=${u.threw} (${u.msg}) unlocked=${offline2.isUnlocked()}`,
  )

  // Offline mà phiên trình duyệt chưa từng kiểm tra → KHÔNG đoán: throw (= chưa biết).
  const savedStatus = sessionMem.get(S?.ACCOUNT_STATUS_SESSION_KEY)
  sessionMem.delete(S?.ACCOUNT_STATUS_SESSION_KEY)
  const offline3 = Store()
  const r3 = await throws(() => offline3.refreshStatus())
  check('T2.6 offline + không có bản session → throw (chưa biết, không coi là "chưa bật")', r3.threw && !offline3.isEnabled(), r3.msg)
  sessionMem.set(S?.ACCOUNT_STATUS_SESSION_KEY, savedStatus)
  net.online = true

  // Khóa ngay: seal đĩa bằng key TRƯỚC, rồi mới bỏ key, rồi nạp lại RAM.
  storeCtx = offline2
  notesLog.length = 0
  if (typeof offline2.lockNow === 'function') await offline2.lockNow()
  check(
    'T2.7 lockNow: persistCache khi CÒN key → bỏ key → xóa DEK session → hydrate khi đã khóa',
    JSON.stringify(notesLog) === JSON.stringify(['persist(unlocked=true)', 'hydrate(unlocked=false)']) &&
      !offline2.isUnlocked() &&
      !sessionMem.has(S?.ACCOUNT_DEK_SESSION_KEY),
    `log=${JSON.stringify(notesLog)} unlocked=${offline2.isUnlocked()} dek=${sessionMem.has(S?.ACCOUNT_DEK_SESSION_KEY)}`,
  )

  // DEK của user khác trong session → không được dùng.
  await popup1.unlock(PASS)
  const dekEntry = sessionMem.get(S?.ACCOUNT_DEK_SESSION_KEY)
  sessionMem.set(S?.ACCOUNT_DEK_SESSION_KEY, { ...dekEntry, userId: 'u-khac' })
  const popup3 = Store()
  await popup3.refreshStatus()
  const foreign = typeof popup3.restoreFromSession === 'function' ? await popup3.restoreFromSession() : true
  check('T2.8 DEK session của user khác → không mở khóa', !foreign && !popup3.isUnlocked(), `restored=${foreign}`)
  sessionMem.set(S?.ACCOUNT_DEK_SESSION_KEY, dekEntry)

  // Refresh trả về user khác → key đang cầm bị bỏ.
  net.userId = 'u2'
  await popup1.refreshStatus()
  check('T2.9 refresh ra user khác → bỏ key đang cầm', !popup1.isUnlocked(), `unlocked=${popup1.isUnlocked()}`)
  net.userId = 'u1'

  popup2.clearStatus()
  await new Promise((r) => setTimeout(r, 0))
  check(
    'T2.10 clearStatus (logout) → xóa status + DEK khỏi session',
    !sessionMem.has(S?.ACCOUNT_STATUS_SESSION_KEY) && !sessionMem.has(S?.ACCOUNT_DEK_SESSION_KEY),
    JSON.stringify([...sessionMem.keys()]),
  )

  check('T2.11 BẤT BIẾN: suốt các kịch bản, chrome.storage.local không bị ghi', localMem.size === 0, `local=${JSON.stringify([...localMem.keys()])}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring: App.vue / Settings / background / notes / i18n / SECURITY.md')

const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const settingsSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'layout', 'SettingsModal.vue'), 'utf8')
const bgSrc = fs.readFileSync(path.join(ROOT, 'src', 'background.ts'), 'utf8')
const notesSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'notes.ts'), 'utf8')
const viSrc = fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'vi.ts'), 'utf8')
const enSrc = fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'en.ts'), 'utf8')
const securityMd = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8')

check(
  'W1 refreshAccountCryptoStatus thử restoreFromSession trước khi mở modal',
  (extractFn(appSrc, 'refreshAccountCryptoStatus') ?? '').includes('restoreFromSession()'),
  'mở lại popup vẫn bắt gõ passphrase',
)

const changedBody = extractFn(appSrc, 'onAccountSessionChanged') ?? ''
check(
  'W2 onMounted nghe chrome.storage.onChanged; DEK bị xóa → lockAccountNow, DEK mới → restore',
  appSrc.includes('chrome.storage.onChanged.addListener(onAccountSessionChanged)') &&
    changedBody.includes('lockAccountNow(') &&
    changedBody.includes('restoreFromSession()'),
  changedBody.replace(/\s+/g, ' ').slice(0, 160),
)

const lockBody = extractFn(appSrc, 'lockAccountNow') ?? ''
check(
  'W3 lockAccountNow: flushSave (còn key) TRƯỚC account.lockNow',
  lockBody.includes('flushSave()') &&
    lockBody.includes('account.lockNow(') &&
    lockBody.indexOf('flushSave()') < lockBody.indexOf('account.lockNow('),
  lockBody.replace(/\s+/g, ' ').slice(0, 160),
)

check(
  'W4 refreshStoresFromNetwork hỏi lại server khi trạng thái chỉ đến từ bản session',
  (extractFn(appSrc, 'refreshStoresFromNetwork') ?? '').includes('account.stale'),
  'có mạng lại vẫn tin bản session cũ',
)

check(
  'W5 background.ts: alarm ACCOUNT_AUTOLOCK_ALARM → purgeExpiredSessionDek',
  bgSrc.includes('ACCOUNT_AUTOLOCK_ALARM') && bgSrc.includes('purgeExpiredSessionDek()'),
  'DEK hết hạn vẫn nằm trong session tới khi có ai đọc',
)

check(
  'W6 Settings có "Khóa ngay" (emit lock-account → App.vue lockAccountNow) + i18n vi/en',
  settingsSrc.includes("emit('lock-account')") &&
    appSrc.includes('@lock-account="lockAccountNow()"') &&
    viSrc.includes("'account.lockNow'") &&
    enSrc.includes("'account.lockNow'"),
  'thiếu nút / wiring / i18n',
)

check(
  'W7 notes.ts requireAccountKey gia hạn tự khóa (markActivity)',
  (extractFn(notesSrc, 'requireAccountKey') ?? '').includes('markActivity()'),
  'đang gõ ghi chú vẫn bị tự khóa sau 30 phút',
)

check(
  'W8 SECURITY.md mô tả chrome.storage.session + tự khóa 30 phút',
  securityMd.includes('S2C1.3') && securityMd.includes('chrome.storage.session') && securityMd.includes('30 phút'),
  'tài liệu bảo mật còn mô tả D5 cũ',
)

check(
  'W9 mount: không ai đăng nhập → clearAccountSession',
  appSrc.includes('!isAuthenticated.value) await clearAccountSession()'),
  'trạng thái/DEK account cũ sống tiếp trong local mode',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2C1.3-session-key-offline-unlock.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2C1.3 đúng spec.')
