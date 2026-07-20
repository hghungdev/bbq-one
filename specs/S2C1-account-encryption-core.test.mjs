/**
 * FAILING TEST — S2C1: Encrypted Account core (store + seal/push adapter + wiring).
 *
 * Chạy:   node specs/S2C1-account-encryption-core.test.mjs   (Node ≥ 20 — WebCrypto thật)
 * Điều kiện: S2A + S2B GREEN (dùng secureCrypto v2 + accountCrypto utils THẬT).
 *
 * RED trên code hiện tại:
 *   - T-A fail: src/stores/accountCrypto.ts chưa tồn tại.
 *   - T-B fail: sealSecureRowsForCache chưa có tham số account (row thường vẫn plaintext).
 *   - T-C fail: syncDirtyNotesFromList chưa có account (push plaintext / không skip khi locked).
 *   - W fail: chưa wiring notes.ts / sync.ts / UI / i18n / SECURITY.md.
 * GREEN sau khi áp specs/S2C1-account-encryption-core.spec.md.
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

async function throws(fn, needle) {
  try {
    await fn()
    return { threw: false, msg: '(không throw)' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { threw: needle ? msg.includes(needle) : true, msg }
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
  const start = src.indexOf(`async function ${fnName}(`)
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

const count = (src, needle) => src.split(needle).length - 1

// ── nền: modules THẬT từ S2A/S2B ─────────────────────────────────────────────
const secureCrypto = loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCrypto.ts'), {})
const acctUtils = loadTsModule(path.join(ROOT, 'src', 'utils', 'accountCrypto.ts'), {
  '@/utils/secureCrypto': secureCrypto,
})

// ═════════════════════════════════════════════════════════════════════════════
console.log('T-A — stores/accountCrypto.ts: ceremony / unlock / recovery / overlay (CODE THẬT)')

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

// Store import dạng named function → gọi bare (this === undefined). Mock phải dùng closure.
const svc = { row: null, upserts: 0 }
const svcMock = {
  fetchUserCryptoRow: async () => (svc.row ? { ...svc.row } : null),
  upsertUserCryptoRow: async (r) => {
    svc.upserts++
    svc.row = { ...r }
  },
}

const notesState = { notes: [], bodies: [] }

const STORE_PATH = path.join(ROOT, 'src', 'stores', 'accountCrypto.ts')
let S = null
try {
  const mod = loadTsModule(STORE_PATH, {
    pinia: piniaMock,
    vue: vueMock,
    '@/utils/accountCrypto': acctUtils,
    '@/utils/secureCrypto': secureCrypto,
    '@/services/userCrypto.service': svcMock,
    '@/stores/notes': { useNotesStore: () => notesState },
  })
  S = mod.useAccountCryptoStore
  check('T-A0 store load + export useAccountCryptoStore', typeof S === 'function', `typeof=${typeof S}`)
} catch (e) {
  check('T-A0 file src/stores/accountCrypto.ts tồn tại và load được', false, e.message)
}

let recoveryDisplay = null
const GOOD = 'passphrase đúng 10+'
const KP = { kdfParams: { iterations: 1_000 } }

if (S) {
  const s1 = S()
  await s1.refreshStatus()

  const g1 = await throws(() => s1.enableAccountEncryption('ngắn quá', KP), 'at least 10')
  check('T-A1 enable chặn passphrase < 10 (chưa upsert)', g1.threw && svc.upserts === 0, `${g1.msg}, upserts=${svc.upserts}`)

  const res = await s1.enableAccountEncryption(GOOD, KP)
  recoveryDisplay = res.recoveryDisplay
  const row = svc.row
  const wOk = row && secureCrypto.parseEnvelopeV2(row.wrapped_dek)?.kid === 'k1'
  const rOk = row && secureCrypto.parseEnvelopeV2(row.wrapped_dek_recovery) !== null
  const vOk = row && secureCrypto.parseEnvelopeV2(row.verifier) !== null
  check(
    'T-A2 ceremony = 1 upsert; row đủ shape (kdf/params/salt/wrapped×2/verifier); unlocked ngay',
    svc.upserts === 1 &&
      row.kdf === 'pbkdf2-sha256' &&
      row.kdf_params.iterations === 1_000 &&
      typeof row.kdf_salt === 'string' &&
      wOk && rOk && vOk &&
      /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/.test(recoveryDisplay) &&
      s1.isEnabled() && s1.isUnlocked(),
    `upserts=${svc.upserts} row=${JSON.stringify(row).slice(0, 120)}… display=${recoveryDisplay}`,
  )

  const g2 = await throws(() => s1.enableAccountEncryption(GOOD, KP), 'Already')
  check('T-A3 enable lần 2 → throw, không upsert thêm', g2.threw && svc.upserts === 1, g2.msg)

  // cửa sổ mới (fresh store instance): enabled + locked → unlock
  const s2 = S()
  await s2.refreshStatus()
  const lockedFirst = s2.isEnabled() && !s2.isUnlocked()
  const bad = await throws(() => s2.unlock('passphrase sai rồi'), 'Wrong passphrase')
  await s2.unlock(GOOD)
  check(
    'T-A4 cửa sổ mới: enabled+locked; sai pass → Wrong passphrase; đúng → unlocked',
    lockedFirst && bad.threw && s2.isUnlocked() && s2.getContentKey() !== null,
    `lockedFirst=${lockedFirst} bad=${bad.msg}`,
  )

  const env = await secureCrypto.encryptFieldV2('hello-x', s1.getContentKey(), 'k1')
  const back = await secureCrypto.decryptField(env, s2.getContentKey())
  check('T-A5 K_content nhất quán giữa hai cửa sổ (cùng DEK)', back === 'hello-x', `back=${back}`)

  // recovery re-wrap
  const beforeWrapped = svc.row.wrapped_dek
  const beforeRec = svc.row.wrapped_dek_recovery
  const s3 = S()
  await s3.refreshStatus()
  const sloppy = recoveryDisplay.toLowerCase().replace(/-/g, ' ')
  const NEWPASS = 'passphrase mới 10+'
  await s3.unlockWithRecoveryAndRewrap(sloppy, NEWPASS, KP)
  check(
    'T-A6 recovery re-wrap: wrapped_dek ĐỔI, wrapped_dek_recovery GIỮ, unlocked',
    svc.upserts === 2 &&
      svc.row.wrapped_dek !== beforeWrapped &&
      svc.row.wrapped_dek_recovery === beforeRec &&
      s3.isUnlocked(),
    `upserts=${svc.upserts}`,
  )

  const s4 = S()
  await s4.refreshStatus()
  const oldDead = await throws(() => s4.unlock(GOOD), 'Wrong passphrase')
  await s4.unlock(NEWPASS)
  const s5 = S()
  await s5.refreshStatus()
  await s5.unlockWithRecoveryAndRewrap(recoveryDisplay, 'passphrase khác nữa 10+', KP)
  check(
    'T-A7 passphrase cũ CHẾT, mới sống; recovery key CŨ vẫn dùng lại được',
    oldDead.threw && s4.isUnlocked() && s5.isUnlocked() && svc.upserts === 3,
    `oldDead=${oldDead.msg} upserts=${svc.upserts}`,
  )

  s1.lock()
  check('T-A8 lock(): mất key trong RAM', !s1.isUnlocked() && s1.getContentKey() === null, '')

  // overlay v2 — chỉ đụng row v2; v1/plaintext để yên
  const kNow = s4.getContentKey()
  const encT = await secureCrypto.encryptFieldV2('TIÊU ĐỀ MẬT', kNow, 'k1')
  const encL = await secureCrypto.encryptFieldV2('NHÃN MẬT', kNow, 'k1')
  notesState.notes = [
    { id: 'v2', folder_id: null, title: encT },
    { id: 'v1', folder_id: 'F-SEC', title: 'retronote:1:AAAAAAAAAAAAAAAA:QUJD' },
    { id: 'pl', folder_id: 'F-PLAIN', title: 'plain title' },
  ]
  notesState.bodies = [{ id: 'b', note_id: 'v2', label: encL, content: 'còn plaintext' }]
  await s4.decryptLoadedAccountRows()
  check(
    'T-A9 overlay: v2 → plaintext; v1 + plaintext KHÔNG bị đụng; body mixed đúng từng field',
    notesState.notes[0].title === 'TIÊU ĐỀ MẬT' &&
      notesState.notes[1].title === 'retronote:1:AAAAAAAAAAAAAAAA:QUJD' &&
      notesState.notes[2].title === 'plain title' &&
      notesState.bodies[0].label === 'NHÃN MẬT' &&
      notesState.bodies[0].content === 'còn plaintext',
    JSON.stringify(notesState.notes.map((n) => n.title)),
  )

  const s6 = S()
  await s6.refreshStatus() // locked
  notesState.notes = [{ id: 'v2', folder_id: null, title: encT }]
  await s6.decryptLoadedAccountRows()
  check('T-A10 overlay khi LOCKED = no-op', notesState.notes[0].title === encT, `title=${notesState.notes[0].title.slice(0, 20)}…`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT-B — sealSecureRowsForCache: tham số account (CODE THẬT, crypto thật)')

const seal = loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCache.ts'), {
  '@/utils/secureCrypto': secureCrypto,
}).sealSecureRowsForCache

const folderKey = await secureCrypto.deriveKeyFromPassword('folder-pass', secureCrypto.generateSalt16(), 1_000)
const dekB = acctUtils.generateDekBytes()
const contentK = await acctUtils.deriveContentKey(dekB)
const isSecureFolder = (id) => id === 'F-SEC' || id === 'F-LOCKED'
const getKey = (id) => (id === 'F-SEC' ? folderKey : null)
const preV2 = await secureCrypto.encryptFieldV2('đã v2 sẵn', contentK, 'k1')

function fixtures() {
  return {
    notes: [
      { id: 'n1', folder_id: 'F-PLAIN', title: 'PLAIN-1' },
      { id: 'n2', folder_id: null, title: 'PLAIN-NULL-FOLDER' },
      { id: 'n3', folder_id: 'F-SEC', title: 'SECRET-V1' },
      { id: 'n4', folder_id: 'F-LOCKED', title: 'LOCKED-PLAIN' },
      { id: 'n5', folder_id: 'F-PLAIN', title: preV2 },
    ],
    bodies: [
      { id: 'b1', note_id: 'n1', label: 'L-PLAIN', content: 'C-PLAIN' },
      { id: 'b2', note_id: 'n2', label: preV2, content: 'C-MIXED-PLAIN' },
      { id: 'b4', note_id: 'n4', label: 'LB', content: 'LC' },
    ],
  }
}

{
  const f = fixtures()
  const out = await seal({ notes: f.notes, bodies: f.bodies, isSecureFolder, getKey, account: null })
  const N = Object.fromEntries(out.notes.map((n) => [n.id, n]))
  check(
    'T-B1 account=null: hành vi S1 nguyên vẹn (thường passthrough, secure v1, locked drop)',
    N.n1?.title === 'PLAIN-1' &&
      N.n2?.title === 'PLAIN-NULL-FOLDER' &&
      N.n3?.title.startsWith('retronote:1:') &&
      N.n4 === undefined &&
      N.n5?.title === preV2 &&
      out.dropped === 2,
    `out=${JSON.stringify(out.notes.map((n) => [n.id, String(n.title).slice(0, 18)]))} dropped=${out.dropped}`,
  )
}

{
  const f = fixtures()
  const out = await seal({
    notes: f.notes,
    bodies: f.bodies,
    isSecureFolder,
    getKey,
    account: { key: contentK, kid: 'k1' },
  })
  const N = Object.fromEntries(out.notes.map((n) => [n.id, n]))
  const B = Object.fromEntries(out.bodies.map((b) => [b.id, b]))
  const v2ok = async (v, plain) =>
    secureCrypto.parseEnvelopeV2(v) !== null && (await secureCrypto.decryptField(v, contentK)) === plain
  check(
    'T-B2 account set: row thường + null-folder → v2 decrypt được; secure folder VẪN v1',
    (await v2ok(N.n1?.title, 'PLAIN-1')) &&
      (await v2ok(N.n2?.title, 'PLAIN-NULL-FOLDER')) &&
      N.n3?.title.startsWith('retronote:1:'),
    `n1=${String(N.n1?.title).slice(0, 22)}… n3=${String(N.n3?.title).slice(0, 22)}…`,
  )
  check(
    'T-B3 không encrypt chồng (n5 giữ nguyên) + body mixed đúng field + KHÔNG mutate input',
    N.n5?.title === preV2 &&
      B.b2?.label === preV2 &&
      (await v2ok(B.b2?.content, 'C-MIXED-PLAIN')) &&
      f.notes[0].title === 'PLAIN-1' &&
      f.bodies[2].content === 'LC',
    `n5=${String(N.n5?.title).slice(0, 18)}… input n1=${f.notes[0].title}`,
  )
  check(
    'T-B4 body của note thường được seal v2 đủ cả label lẫn content',
    (await v2ok(B.b1?.label, 'L-PLAIN')) && (await v2ok(B.b1?.content, 'C-PLAIN')),
    `b1=${JSON.stringify(B.b1 ?? null).slice(0, 60)}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT-C — sync.service push guard: encrypt v2 / skip-khi-locked (CODE THẬT)')

const noteUpdates = []
const bodyUpdates = []
const syncSvc = loadTsModule(path.join(ROOT, 'src', 'services', 'sync.service.ts'), {
  '@/constants/storage': loadTsModule(path.join(ROOT, 'src', 'constants', 'storage.ts'), {}),
  '@/constants/calendar': loadTsModule(path.join(ROOT, 'src', 'constants', 'calendar.ts'), {}),
  '@/utils/secureCrypto': secureCrypto,
  './notes.service': {
    notesService: {
      update: async (id, payload) => {
        noteUpdates.push({ id, payload })
        return { ...payload, updated_at: '2026-01-03T00:00:00Z' }
      },
    },
  },
  './noteBodies.service': {
    noteBodiesService: {
      update: async (id, payload) => {
        bodyUpdates.push({ id, payload })
        return { ...payload, updated_at: '2026-01-03T00:00:00Z' }
      },
    },
  },
  './calendarEvents.service': { calendarEventsService: {} },
  './localFirst/authMode': { isAuthenticated: async () => true, getCurrentUserId: async () => 'u1' },
  './localFirst/dataOwner.service': { isPushAllowedFor: async () => true },
  '@/utils/syncConflict': { isSyncConflictError: () => false, stashConflictBackup: async () => {} },
}).syncService

function dirtyFixture() {
  return {
    notes: [
      {
        id: 'n1',
        folder_id: 'F-PLAIN',
        title: 'PUSH-PLAINTEXT',
        tags: [],
        updated_at: '2026-01-02T00:00:00Z',
        synced_at: '2026-01-01T00:00:00Z',
      },
    ],
    bodies: [
      {
        id: 'b1',
        note_id: 'n1',
        label: 'PUSH-LABEL',
        content: 'PUSH-CONTENT',
        position: 0,
        updated_at: '2026-01-02T00:00:00Z',
        synced_at: '2026-01-01T00:00:00Z',
      },
    ],
    folders: [{ id: 'F-PLAIN', is_secure: false }],
  }
}

{
  noteUpdates.length = 0
  bodyUpdates.length = 0
  const f = dirtyFixture()
  await syncSvc.syncDirtyNotesFromList(f.notes, f.bodies, f.folders, () => null, {
    key: contentK,
    kid: 'k1',
  })
  const t = noteUpdates[0]?.payload?.title
  const l = bodyUpdates[0]?.payload?.label
  const c = bodyUpdates[0]?.payload?.content
  const dec = async (v, plain) =>
    v && secureCrypto.parseEnvelopeV2(v) !== null && (await secureCrypto.decryptField(v, contentK)) === plain
  check(
    'T-C1 account unlocked: payload lên server là v2 (title/label/content), decrypt đúng',
    (await dec(t, 'PUSH-PLAINTEXT')) && (await dec(l, 'PUSH-LABEL')) && (await dec(c, 'PUSH-CONTENT')),
    `title=${String(t).slice(0, 24)}… label=${String(l).slice(0, 24)}…`,
  )
}

{
  noteUpdates.length = 0
  bodyUpdates.length = 0
  const f = dirtyFixture()
  await syncSvc.syncDirtyNotesFromList(f.notes, f.bodies, f.folders, () => null, {
    key: null,
    kid: 'k1',
  })
  check(
    'T-C2 account bật nhưng LOCKED: row plaintext bị SKIP — không update call nào',
    noteUpdates.length === 0 && bodyUpdates.length === 0,
    `noteUpdates=${noteUpdates.length} bodyUpdates=${bodyUpdates.length} — plaintext sắp lên cloud`,
  )
}

{
  noteUpdates.length = 0
  bodyUpdates.length = 0
  const f = dirtyFixture()
  await syncSvc.syncDirtyNotesFromList(f.notes, f.bodies, f.folders, () => null, null)
  check(
    'T-C3 account off: hành vi cũ (legacy pre-backfill — plaintext như hôm nay)',
    noteUpdates[0]?.payload?.title === 'PUSH-PLAINTEXT',
    `title=${String(noteUpdates[0]?.payload?.title).slice(0, 24)}`,
  )
}

{
  noteUpdates.length = 0
  bodyUpdates.length = 0
  const f = dirtyFixture()
  f.folders = [{ id: 'F-PLAIN', is_secure: true }]
  await syncSvc.syncDirtyNotesFromList(f.notes, f.bodies, f.folders, () => folderKey, {
    key: contentK,
    kid: 'k1',
  })
  check(
    'T-C4 folder secure: vẫn v1 bằng folder key — account KHÔNG chen vào (ưu tiên folder)',
    String(noteUpdates[0]?.payload?.title).startsWith('retronote:1:'),
    `title=${String(noteUpdates[0]?.payload?.title).slice(0, 24)}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring: notes.ts / sync.ts / UI / i18n / SECURITY.md')

const notesSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'notes.ts'), 'utf8')
const sealSrc = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'secureCache.ts'), 'utf8')
const syncSrvSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'sync.service.ts'), 'utf8')
const syncStoreSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'sync.ts'), 'utf8')
const readOrNull = (p) => {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}
const unlockVue = readOrNull(path.join(ROOT, 'src', 'components', 'account', 'AccountUnlockModal.vue'))
const setupVue = readOrNull(path.join(ROOT, 'src', 'components', 'account', 'AccountEncryptionSetupModal.vue'))
const settingsVue = fs.readFileSync(path.join(ROOT, 'src', 'components', 'layout', 'SettingsModal.vue'), 'utf8')
const pagesApp = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const noteItem = fs.readFileSync(path.join(ROOT, 'src', 'components', 'notes', 'NoteItem.vue'), 'utf8')
const viSrc = fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'vi.ts'), 'utf8')
const enSrc = fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'en.ts'), 'utf8')
const securityMd = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8')

check('W1 secureCache.ts: input có account + dùng encryptFieldV2',
  sealSrc.includes('account') && sealSrc.includes('encryptFieldV2('),
  'seal chưa biết account-mode → đĩa còn plaintext row thường khi unlocked')

check('W2 notes.ts: ≥4 call site encryptFieldV2 + import store accountCrypto',
  count(notesSrc, 'encryptFieldV2(') >= 4 && notesSrc.includes("@/stores/accountCrypto"),
  `encryptFieldV2=${count(notesSrc, 'encryptFieldV2(')} import=${notesSrc.includes('@/stores/accountCrypto')}`)

const runSearchBody = extractFn(notesSrc, 'runSearch')
check('W3 runSearch: lọc theo row-đang-khóa, bỏ lọc theo secure-folder',
  runSearchBody !== null &&
    runSearchBody.includes('!isEncryptedEnvelope(n.title)') &&
    !runSearchBody.includes('isSecureFolder(n.folder_id)'),
  `body=${runSearchBody ? runSearchBody.replace(/\s+/g, ' ').slice(0, 120) : 'KHÔNG TÌM THẤY'}`)

check('W4 notes.ts: ≥3 call site decryptLoadedAccountRows (persistCache + loadAll ×2)',
  count(notesSrc, 'decryptLoadedAccountRows(') >= 3,
  `count=${count(notesSrc, 'decryptLoadedAccountRows(')}`)

check('W5 sync.service có param account + stores/sync.ts truyền (getDekId)',
  syncSrvSrc.includes('account?') && syncStoreSrc.includes('getDekId'),
  `service=${syncSrvSrc.includes('account?')} store=${syncStoreSrc.includes('getDekId')}`)

check('W6 AccountUnlockModal.vue tồn tại: unlock + recovery re-wrap',
  unlockVue !== null && unlockVue.includes('unlockWithRecoveryAndRewrap') && unlockVue.includes('account.unlock'),
  unlockVue === null ? 'file chưa tồn tại' : 'thiếu wiring store action')

check('W7 AccountEncryptionSetupModal.vue tồn tại: enable + recoveryBytes + generateRecoveryKey',
  setupVue !== null &&
    setupVue.includes('enableAccountEncryption') &&
    setupVue.includes('recoveryBytes') &&
    setupVue.includes('generateRecoveryKey'),
  setupVue === null ? 'file chưa tồn tại' : 'ceremony chưa sinh key trước-commit / chưa truyền bytes')

check('W8 SettingsModal wire setup modal + pages/App.vue mount unlock + refreshStatus + lock() khi logout',
  settingsVue.includes('AccountEncryptionSetupModal') &&
    pagesApp.includes('AccountUnlockModal') &&
    pagesApp.includes('refreshStatus') &&
    pagesApp.includes('account.lock()'),
  `settings=${settingsVue.includes('AccountEncryptionSetupModal')} app=${pagesApp.includes('AccountUnlockModal')}/${pagesApp.includes('refreshStatus')}/${pagesApp.includes('account.lock()')}`)

check('W9 NoteItem mask row khóa (isEncryptedEnvelope)',
  noteItem.includes('isEncryptedEnvelope'),
  'row v2 khi locked sẽ hiện chuỗi bbq:2:… trần trong list')

check('W10 i18n vi+en có account.titleUnlock; SECURITY.md có section S2C1',
  viSrc.includes("'account.titleUnlock'") && enSrc.includes("'account.titleUnlock'") && securityMd.includes('S2C1'),
  `vi=${viSrc.includes("'account.titleUnlock'")} en=${enSrc.includes("'account.titleUnlock'")} sec=${securityMd.includes('S2C1')}`)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2C1-account-encryption-core.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2C1 đúng spec.')
