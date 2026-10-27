/**
 * FAILING TEST — S2C1.2: seal có nhớ (hiệu năng) + conflict backup không lưu plaintext.
 *
 * Chạy:   node specs/S2C1.2-seal-memo-conflict-backup.test.mjs   (Node ≥ 20 — WebCrypto thật)
 *
 * Đo bằng SỐ LỆNH WebCrypto (đếm qua wrapper crypto.subtle), không đo thời gian → không chập chờn.
 *
 * RED trên ed96f6d:
 *   - T1 fail: persistCache mã hóa lại MỌI row mỗi lần (2.000 note ≈ 0,86 s/autosave trên Chromium).
 *   - T2 fail: overlay giải mã lại mọi row v2 dù envelope không đổi.
 *   - T3 fail: conflict backup lưu row RAM plaintext xuống chrome.storage.local.
 *   - W  fail: dialog conflict backup không mở được bản mã / có thể Restore chuỗi envelope.
 * GREEN sau khi áp specs/S2C1.2-seal-memo-conflict-backup.spec.md.
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

// ── đếm lệnh WebCrypto (crypto THẬT, chỉ bọc thêm bộ đếm) ────────────────────
const ops = { encrypt: 0, decrypt: 0 }
const subtle = globalThis.crypto.subtle
const realEncrypt = subtle.encrypt.bind(subtle)
const realDecrypt = subtle.decrypt.bind(subtle)
subtle.encrypt = (...a) => {
  ops.encrypt++
  return realEncrypt(...a)
}
subtle.decrypt = (...a) => {
  ops.decrypt++
  return realDecrypt(...a)
}
const resetOps = () => {
  ops.encrypt = 0
  ops.decrypt = 0
}

const secureCrypto = loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCrypto.ts'), {})
const acctUtils = loadTsModule(path.join(ROOT, 'src', 'utils', 'accountCrypto.ts'), {
  '@/utils/secureCrypto': secureCrypto,
})
const cacheMod = loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCache.ts'), {
  '@/utils/secureCrypto': secureCrypto,
})
const seal = cacheMod.sealSecureRowsForCache

const contentK = await acctUtils.deriveContentKey(acctUtils.generateDekBytes())
const folderKey = await secureCrypto.deriveKeyFromPassword('folder-pass', secureCrypto.generateSalt16(), 1_000)
const account = { key: contentK, kid: 'k1' }
const isSecureFolder = (id) => id === 'F-SEC'
const getKey = (id) => (id === 'F-SEC' ? folderKey : null)

function makeData(n) {
  const notes = []
  const bodies = []
  for (let i = 0; i < n; i++) {
    notes.push({ id: `n${i}`, folder_id: i % 50 === 0 ? 'F-SEC' : 'F1', title: `Tiêu đề ${i}` })
    bodies.push({ id: `b${i}`, note_id: `n${i}`, label: `nhãn ${i}`, content: `<p>nội dung ${i} ${'x'.repeat(200)}</p>` })
  }
  return { notes, bodies }
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — utils/secureCache.ts: seal nhớ bản mã theo (key, row, field) (CODE THẬT)')

const N = 2000
const data = makeData(N)
resetOps()
const first = await seal({ ...data, isSecureFolder, getKey, account })
const firstOps = ops.encrypt
check('T1.0 tiền đề: lần seal đầu mã hóa mọi field plaintext', firstOps === N * 3, `encrypt=${firstOps} (kỳ vọng ${N * 3})`)

resetOps()
const second = await seal({ ...data, isSecureFolder, getKey, account })
check(
  'T1.1 seal lần 2, RAM không đổi → 0 lệnh encrypt (2.000 note)',
  ops.encrypt === 0,
  `encrypt=${ops.encrypt} — persistCache mã hóa lại toàn bộ mỗi lần autosave`,
)
const sameEnv =
  second.notes.every((n, i) => n.title === first.notes[i].title) &&
  second.bodies.every((b, i) => b.content === first.bodies[i].content && b.label === first.bodies[i].label)
check('T1.2 envelope dùng lại y hệt (đĩa không bị ghi lại vô ích)', sameEnv, 'envelope đổi dù plaintext không đổi')

data.bodies[7] = { ...data.bodies[7], content: '<p>vừa sửa</p>' }
resetOps()
const third = await seal({ ...data, isSecureFolder, getKey, account })
check(
  'T1.3 sửa 1 body → đúng 1 lệnh encrypt, chỉ envelope đó đổi',
  ops.encrypt === 1 &&
    third.bodies[7].content !== second.bodies[7].content &&
    third.bodies[8].content === second.bodies[8].content,
  `encrypt=${ops.encrypt}`,
)
check(
  'T1.4 envelope mới vẫn giải mã đúng plaintext mới',
  (await secureCrypto.decryptField(third.bodies[7].content, contentK)) === '<p>vừa sửa</p>',
  'sai nội dung',
)

{
  const twin = {
    notes: [
      { id: 'tA', folder_id: 'F1', title: 'TRÙNG' },
      { id: 'tB', folder_id: 'F1', title: 'TRÙNG' },
    ],
    bodies: [],
  }
  const out = await seal({ ...twin, isSecureFolder, getKey, account })
  check(
    'T1.5 hai row trùng plaintext → hai bản mã KHÁC nhau (nhớ theo row, không theo nội dung)',
    out.notes[0].title !== out.notes[1].title,
    'memo theo plaintext làm lộ "hai ghi chú giống nhau"',
  )
}

{
  const otherK = await acctUtils.deriveContentKey(acctUtils.generateDekBytes())
  const one = { notes: [{ id: 'n1', folder_id: 'F1', title: 'Tiêu đề 1' }], bodies: [] }
  const out = await seal({ ...one, isSecureFolder, getKey, account: { key: otherK, kid: 'k1' } })
  check(
    'T1.6 key khác → không dùng lại bản mã của key cũ',
    (await secureCrypto.decryptField(out.notes[0].title, otherK)) === 'Tiêu đề 1',
    'bản mã của key cũ bị tái sử dụng với key mới → không giải mã được',
  )
}

{
  const dumped = JSON.stringify(third)
  const leaked = ['Tiêu đề 3', 'nội dung 3 ', 'vừa sửa'].filter((s) => dumped.includes(s))
  check('T1.7 BẤT BIẾN: bản ghi cache không chứa plaintext', leaked.length === 0, `rò rỉ: ${JSON.stringify(leaked)}`)
}

const openSealedField = cacheMod.openSealedField
check('T1.8 secureCache export openSealedField', typeof openSealedField === 'function', `typeof=${typeof openSealedField}`)

if (typeof openSealedField === 'function') {
  resetOps()
  const plain = await openSealedField(contentK, 'n:n5:title', third.notes[5].title)
  check(
    'T1.9 mở envelope vừa seal → plaintext, 0 lệnh decrypt',
    plain === 'Tiêu đề 5' && ops.decrypt === 0,
    `plain=${plain} decrypt=${ops.decrypt}`,
  )

  // Server trả về envelope KHÁC (row được push với IV khác) → giải mã 1 lần, sau đó seal dùng lại nó.
  const serverEnv = await secureCrypto.encryptFieldV2('Tiêu đề 6', contentK, 'k1')
  resetOps()
  const p6 = await openSealedField(contentK, 'n:n6:title', serverEnv)
  const decOps = ops.decrypt
  resetOps()
  const again = await seal({ ...data, isSecureFolder, getKey, account })
  check(
    'T1.10 envelope lạ → 1 lệnh decrypt; seal sau đó dùng lại đúng envelope đó (đĩa hội tụ về server)',
    p6 === 'Tiêu đề 6' && decOps === 1 && again.notes[6].title === serverEnv && ops.encrypt === 0,
    `p6=${p6} decrypt=${decOps} sameAsServer=${again.notes[6].title === serverEnv} encrypt=${ops.encrypt}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — stores/accountCrypto.ts: overlay dùng bản nhớ (CODE THẬT)')

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
const svc = { row: null }
const notesState = { notes: [], bodies: [] }
let storeMod = null
try {
  storeMod = loadTsModule(path.join(ROOT, 'src', 'stores', 'accountCrypto.ts'), {
    pinia: piniaMock,
    vue: vueMock,
    '@/utils/accountCrypto': acctUtils,
    '@/utils/secureCrypto': secureCrypto,
    '@/utils/secureCache': cacheMod,
    '@/services/userCrypto.service': {
      fetchUserCryptoRow: async () => (svc.row ? { ...svc.row } : null),
      fetchUserCryptoStatus: async () => ({ userId: 'u1', row: svc.row ? { ...svc.row } : null }),
      upsertUserCryptoRow: async (r) => {
        svc.row = { ...r }
      },
    },
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
    '@/stores/notes': { useNotesStore: () => notesState },
  })
} catch (e) {
  check('T2.0 store load được với mock secureCache', false, e.message)
}

if (storeMod) {
  const s = storeMod.useAccountCryptoStore()
  await s.refreshStatus()
  await s.enableAccountEncryption('passphrase đúng 10+', { kdfParams: { iterations: 1_000 } })
  const key = s.getContentKey()
  const ram = makeData(300)
  const sealed = await seal({ ...ram, isSecureFolder, getKey, account: { key, kid: 'k1' } })
  notesState.notes = sealed.notes.map((n) => ({ ...n }))
  notesState.bodies = sealed.bodies.map((b) => ({ ...b }))
  resetOps()
  await s.decryptLoadedAccountRows()
  const restored =
    notesState.notes[1].title === 'Tiêu đề 1' && notesState.bodies[1].content === ram.bodies[1].content
  check(
    'T2.1 overlay row vừa seal → plaintext đúng, 0 lệnh decrypt (300 note)',
    restored && ops.decrypt === 0,
    `restored=${restored} decrypt=${ops.decrypt} — mỗi lần loadAll/persistCache giải mã lại toàn bộ`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — services/sync.service.ts: conflict backup lưu bản ĐÃ MÃ HÓA (CODE THẬT)')

const stashed = []
const conflictErr = Object.assign(new Error('conflict'), { code: 'BBQ_SYNC_CONFLICT' })
const syncMod = loadTsModule(path.join(ROOT, 'src', 'services', 'sync.service.ts'), {
  '@/constants/storage': {
    NOTES_CACHE_KEY: 'notes_cache',
    NOTE_BODIES_CACHE_KEY: 'note_bodies_cache',
    FOLDERS_CACHE_KEY: 'folders_cache',
  },
  '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
  '@/utils/secureCrypto': secureCrypto,
  '@/utils/syncConflict': {
    isSyncConflictError: (e) => e?.code === 'BBQ_SYNC_CONFLICT',
    stashConflictBackup: async (kind, row) => {
      stashed.push({ kind, row: JSON.parse(JSON.stringify(row)) })
    },
  },
  './calendarEvents.service': { calendarEventsService: {} },
  './noteBodies.service': {
    noteBodiesService: {
      update: async () => {
        throw conflictErr
      },
    },
  },
  './notes.service': {
    notesService: {
      update: async () => {
        throw conflictErr
      },
    },
  },
  './localFirst/authMode': { isAuthenticated: async () => true, getCurrentUserId: async () => 'u1' },
  './localFirst/dataOwner.service': { isPushAllowedFor: async () => true },
})

const dirty = { updated_at: '2026-01-02T00:00:00.000Z', synced_at: '2026-01-01T00:00:00.000Z' }
await syncMod.syncService.syncDirtyNotesFromList(
  [
    { id: 'pa', folder_id: 'F1', title: 'BÍ-MẬT-TIÊU-ĐỀ', tags: [], ...dirty },
    { id: 'ps', folder_id: 'F-SEC', title: 'BÍ-MẬT-SECURE', tags: [], ...dirty },
  ],
  [
    { id: 'pb', note_id: 'pa', label: 'BÍ-MẬT-NHÃN', content: 'BÍ-MẬT-NỘI-DUNG', position: 0, ...dirty },
    { id: 'psb', note_id: 'ps', label: 'BÍ-MẬT-NHÃN-SECURE', content: 'BÍ-MẬT-ND-SECURE', position: 0, ...dirty },
  ],
  [
    { id: 'F1', is_secure: false },
    { id: 'F-SEC', is_secure: true },
  ],
  (id) => (id === 'F-SEC' ? folderKey : null),
  account,
)

const byId = Object.fromEntries(stashed.map((e) => [e.row.id, e.row]))
const safeDecrypt = async (v, k) => {
  try {
    return await secureCrypto.decryptField(v, k)
  } catch {
    return null
  }
}
check('T3.0 tiền đề: 4 row conflict được stash', stashed.length === 4, `stashed=${stashed.length}`)
const dumpedStash = JSON.stringify(stashed)
const leakedStash = ['BÍ-MẬT-TIÊU-ĐỀ', 'BÍ-MẬT-NHÃN', 'BÍ-MẬT-NỘI-DUNG', 'BÍ-MẬT-SECURE', 'BÍ-MẬT-ND-SECURE'].filter((s) =>
  dumpedStash.includes(s),
)
check(
  'T3.1 BẤT BIẾN: conflict backup (xuống chrome.storage.local) không chứa plaintext',
  leakedStash.length === 0,
  `rò rỉ: ${JSON.stringify(leakedStash)}`,
)
check(
  'T3.2 note account → title v2 giải mã được; secure folder → v1',
  secureCrypto.parseEnvelopeV2(byId.pa?.title ?? '') !== null &&
    (await safeDecrypt(byId.pa.title, contentK)) === 'BÍ-MẬT-TIÊU-ĐỀ' &&
    String(byId.ps?.title).startsWith('retronote:1:'),
  `pa=${String(byId.pa?.title).slice(0, 20)} ps=${String(byId.ps?.title).slice(0, 20)}`,
)
check(
  'T3.3 body account → label + content v2 giải mã được',
  byId.pb !== undefined &&
    (await safeDecrypt(byId.pb.label, contentK)) === 'BÍ-MẬT-NHÃN' &&
    (await safeDecrypt(byId.pb.content, contentK)) === 'BÍ-MẬT-NỘI-DUNG',
  JSON.stringify(byId.pb)?.slice(0, 80),
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring: overlay dùng memo, dialog conflict mở được bản mã, không Restore envelope')

const acctStoreSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'accountCrypto.ts'), 'utf8')
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const dialogSrc = fs.readFileSync(
  path.join(ROOT, 'src', 'components', 'sync', 'ConflictBackupsDialog.vue'),
  'utf8',
)

const overlayBody = extractFn(acctStoreSrc, 'decryptLoadedAccountRows') ?? ''
check(
  'W1 decryptLoadedAccountRows dùng openSealedField (không gọi decryptField trực tiếp)',
  overlayBody.includes('openSealedField(') && !overlayBody.includes('decryptField('),
  overlayBody.replace(/\s+/g, ' ').slice(0, 160),
)

const showBody = extractFn(appSrc, 'maybeShowConflictBackups') ?? ''
check(
  'W2 maybeShowConflictBackups mở bản mã trước khi hiển thị',
  showBody.includes('openConflictBackupsForView('),
  showBody.replace(/\s+/g, ' ').slice(0, 160),
)

// Chặn envelope trực tiếp, hoặc qua helper hasEnvelopeField (helper phải dùng isEncryptedEnvelope).
const helperBody = extractFn(appSrc, 'hasEnvelopeField') ?? ''
const blocksEnvelope = (src) =>
  src.includes('isEncryptedEnvelope') ||
  (src.includes('hasEnvelopeField(') && helperBody.includes('isEncryptedEnvelope'))

const restorableStart = appSrc.indexOf('const restorableBackupIds')
const restorableBlock = appSrc.slice(restorableStart, appSrc.indexOf('})', restorableStart) + 2)
check(
  'W3 restorableBackupIds loại entry còn envelope (không Restore chuỗi bbq:2:/retronote:1:)',
  blocksEnvelope(restorableBlock),
  'Restore một envelope = mã hóa chồng → hỏng ghi chú',
)

const restoreBody = extractFn(appSrc, 'onConflictBackupRestore') ?? ''
check(
  'W4 onConflictBackupRestore tự chặn envelope (phòng vệ lớp 2)',
  blocksEnvelope(restoreBody),
  restoreBody.replace(/\s+/g, ' ').slice(0, 160),
)

check(
  'W5 ConflictBackupsDialog che envelope trong snippet',
  dialogSrc.includes('isEncryptedEnvelope'),
  'dialog in thẳng chuỗi bbq:2:… ra UI',
)

check(
  'W6 onAccountUnlocked mở lại danh sách backup (vừa có key)',
  (extractFn(appSrc, 'onAccountUnlocked') ?? '').includes('openConflictBackupsForView('),
  'mở khóa xong dialog vẫn hiện bản mã',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2C1.2-seal-memo-conflict-backup.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2C1.2 đúng spec.')
