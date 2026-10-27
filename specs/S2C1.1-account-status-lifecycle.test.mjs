/**
 * REGRESSION TEST — S2C1.1: trạng thái encrypted-account theo đúng vòng đời session.
 *
 * Chạy:   node specs/S2C1.1-account-status-lifecycle.test.mjs   (Node ≥ 20)
 *
 * RED trên c2201db (S2C1):
 *   - T1 fail: fetchUserCryptoRow trả null khi getUser lỗi mạng → "chưa bật mã hóa" → plaintext.
 *   - T2 fail: store không có clearStatus → row account cũ sống qua logout.
 *   - W  fail: pages/App.vue không nạp lại trạng thái sau login (LoginModal) / khi mạng trở lại,
 *              không quên row khi logout, và lỗi refreshStatus làm sập onMounted.
 * GREEN sau khi áp specs/S2C1.1-account-status-lifecycle.spec.md.
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

function extractFn(src, fnName) {
  const start = src.indexOf(`function ${fnName}(`)
  if (start === -1) return null
  let depth = 0
  let i = src.indexOf('{', start)
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

/** Thân callback đầu tiên của `watch(<source>, ...)` — đủ cho static check. */
function extractWatchBody(src, source) {
  const start = src.indexOf(`watch(${source},`)
  if (start === -1) return null
  let depth = 0
  let i = src.indexOf('{', start)
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

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — userCrypto.service: "không kiểm tra được" ≠ "chưa bật" (CODE THẬT)')

const auth = { result: null }
const db = { row: null, error: null }
const supabaseMock = {
  supabase: {
    auth: { getUser: async () => auth.result },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: db.row, error: db.error }),
      }
      return q
    },
  },
}
const svcMod = loadTsModule(path.join(ROOT, 'src', 'services', 'userCrypto.service.ts'), {
  './supabase': supabaseMock,
})

auth.result = {
  data: { user: null },
  error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' },
}
const offline = await throws(() => svcMod.fetchUserCryptoRow())
check('T1.1 getUser lỗi mạng → throw (KHÔNG trả null = "chưa bật")', offline.threw, offline.msg)

auth.result = {
  data: { user: null },
  error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
}
const noSession = await svcMod.fetchUserCryptoRow().catch((e) => `throw: ${e.message}`)
check('T1.2 không có session → null', noSession === null, String(noSession))

auth.result = { data: { user: { id: 'u1' } }, error: null }
db.row = null
const noRow = await svcMod.fetchUserCryptoRow().catch((e) => `throw: ${e.message}`)
check('T1.3 có user, chưa có row → null', noRow === null, String(noRow))

db.row = { dek_id: 'k1', verifier: 'v' }
const withRow = await svcMod.fetchUserCryptoRow().catch((e) => `throw: ${e.message}`)
check('T1.4 có user + row → trả row', withRow?.dek_id === 'k1', JSON.stringify(withRow))

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — stores/accountCrypto.ts: clearStatus quên row của session cũ (CODE THẬT)')

const secureCrypto = loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCrypto.ts'), {})
const acctUtils = loadTsModule(path.join(ROOT, 'src', 'utils', 'accountCrypto.ts'), {
  '@/utils/secureCrypto': secureCrypto,
})
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
const svc = { row: null, gate: null }
const svcMock = {
  fetchUserCryptoRow: async () => {
    if (svc.gate) await svc.gate
    return svc.row ? { ...svc.row } : null
  },
  // S2C1.3: store gọi fetchUserCryptoStatus (row + user id).
  fetchUserCryptoStatus: async () => {
    if (svc.gate) await svc.gate
    return { userId: 'u1', row: svc.row ? { ...svc.row } : null }
  },
  upsertUserCryptoRow: async (r) => {
    svc.row = { ...r }
  },
}
const S = loadTsModule(path.join(ROOT, 'src', 'stores', 'accountCrypto.ts'), {
  pinia: piniaMock,
  vue: vueMock,
  '@/utils/accountCrypto': acctUtils,
  '@/utils/secureCrypto': secureCrypto,
  // S2C1.2: store import thêm secureCache (overlay có nhớ) — nạp module THẬT.
  '@/utils/secureCache': loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCache.ts'), {
    '@/utils/secureCrypto': secureCrypto,
  }),
  // S2C1.3: store import accountSession (chrome.storage.session) — no-op, harness này không có chrome.
  '@/utils/accountSession': {
    writeAccountStatus: async () => {},
    readAccountStatus: async () => null,
    writeSessionDek: async () => {},
    readSessionDek: async () => null,
    touchSessionDek: async () => {},
    clearSessionDek: async () => {},
    clearAccountSession: async () => {},
  },
  '@/services/userCrypto.service': svcMock,
  '@/stores/notes': { useNotesStore: () => ({ notes: [], bodies: [] }) },
}).useAccountCryptoStore

const s = S()
await s.refreshStatus()
await s.enableAccountEncryption('passphrase đúng 10+', { kdfParams: { iterations: 1_000 } })
check('T2.0 tiền đề: account A bật + unlocked', s.isEnabled() && s.isUnlocked(), '')

check('T2.1 store export clearStatus()', typeof s.clearStatus === 'function', `typeof=${typeof s.clearStatus}`)
if (typeof s.clearStatus === 'function') {
  s.unlockModalOpen.value = true
  s.lock()
  s.clearStatus()
  check(
    'T2.2 sau lock()+clearStatus(): isEnabled=false, fetched=false, modal đóng',
    !s.isEnabled() && !s.isUnlocked() && s.fetched.value === false && s.unlockModalOpen.value === false,
    `enabled=${s.isEnabled()} fetched=${s.fetched.value} modal=${s.unlockModalOpen.value}`,
  )

  // refreshStatus của session cũ đang bay → logout → kết quả về muộn KHÔNG được hồi sinh row.
  let release
  svc.gate = new Promise((r) => (release = r))
  const inflight = s.refreshStatus()
  s.clearStatus()
  release()
  await inflight
  svc.gate = null
  check(
    'T2.3 refreshStatus đang bay khi clearStatus → kết quả cũ bị bỏ',
    !s.isEnabled() && s.fetched.value === false,
    `enabled=${s.isEnabled()} fetched=${s.fetched.value}`,
  )

  await s.refreshStatus()
  check('T2.4 refreshStatus sau đó vẫn nạp bình thường', s.isEnabled() && s.fetched.value === true, '')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring: pages/App.vue + SettingsModal.vue')

const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const settingsSrc = fs.readFileSync(
  path.join(ROOT, 'src', 'components', 'layout', 'SettingsModal.vue'),
  'utf8',
)

const logoutBody = extractFn(appSrc, 'onLogout') ?? ''
check(
  'W1 onLogout: lock() + clearStatus() TRƯỚC auth.logout()',
  logoutBody.includes('account.clearStatus()') &&
    logoutBody.indexOf('account.clearStatus()') < logoutBody.indexOf('auth.logout()'),
  logoutBody.replace(/\s+/g, ' ').slice(0, 160),
)

const watchBody = extractWatchBody(appSrc, 'isAuthenticated') ?? ''
check(
  'W2 watch(isAuthenticated): authed → nạp lại trạng thái; mất session → clearStatus',
  watchBody.includes('refreshAccountCryptoStatus()') && watchBody.includes('account.clearStatus()'),
  watchBody.replace(/\s+/g, ' ').slice(0, 200),
)

const helperBody = extractFn(appSrc, 'refreshAccountCryptoStatus') ?? ''
check(
  'W3 refreshAccountCryptoStatus bọc refreshStatus trong try (lỗi mạng không sập onMounted)',
  /try\s*\{[^}]*account\.refreshStatus\(\)/.test(helperBody),
  helperBody ? helperBody.replace(/\s+/g, ' ').slice(0, 160) : 'KHÔNG TÌM THẤY helper',
)

const mountBody = appSrc.slice(appSrc.indexOf('onMounted(async'), appSrc.indexOf('onUnmounted('))
check(
  'W4 onMounted không await account.refreshStatus() trần',
  !mountBody.includes('await account.refreshStatus()') &&
    mountBody.includes('refreshAccountCryptoStatus()'),
  'onMounted vẫn gọi trực tiếp — một lỗi mạng bỏ qua listener auto-sync/network/onMessage',
)

const refreshBody = extractFn(appSrc, 'refreshStoresFromNetwork') ?? ''
const iCheck = refreshBody.indexOf('account.fetched')
const iPush = refreshBody.indexOf('runBackgroundAutoSync(')
check(
  'W5 refreshStoresFromNetwork: chưa biết trạng thái → kiểm tra lại TRƯỚC push',
  iCheck !== -1 && iPush !== -1 && iCheck < iPush,
  `iCheck=${iCheck} iPush=${iPush}`,
)

check(
  'W6 SettingsModal: refreshStatus có .catch (không unhandled rejection khi offline)',
  /accountCrypto\.refreshStatus\(\)\.catch\(/.test(settingsSrc),
  'void accountCrypto.refreshStatus() trần',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2C1.1-account-status-lifecycle.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2C1.1 đúng spec.')
