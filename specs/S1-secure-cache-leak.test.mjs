/**
 * FAILING TEST — S1: plaintext của secure folder bị ghi xuống chrome.storage.local.
 *
 * Chạy:   node specs/S1-secure-cache-leak.test.mjs
 *
 * RED trên code hiện tại:
 *   - T1 fail: src/utils/secureCache.ts chưa tồn tại.
 *   - W1 fail: notes.ts persistCache vẫn ghi thẳng notes.value (plaintext) xuống cache.
 *   - W2 fail: persistCache chưa decrypt lại sau merge.
 *   - W3/W4 fail: secureFolder.ts chưa tách decryptLoadedSecureRows (vẫn tự gọi persistCache).
 *   - W5 fail: loadAll chưa decrypt-overlay ở nhánh offline-return + catch — hai nhánh nạp
 *     envelope từ đĩa vào RAM mà không đi qua persistCache (hôm nay "chạy được" nhờ chính leak).
 * GREEN sau khi áp specs/S1-secure-cache-leak.spec.md.
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

// ── transpile + evaluate 1 file TS như CommonJS, mock import theo specifier ──
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

// cắt thân một `async function <name>(` theo đếm ngoặc nhọn
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

// ═════════════════════════════════════════════════════════════════════════════
// TIMELINE MINH HỌA (không assert) — plaintext chạm đĩa thế nào
// ═════════════════════════════════════════════════════════════════════════════
console.log('TIMELINE — secure folder unlock → plaintext nằm lại trên đĩa sau khi popup đóng')
{
  const timeline = [
    't=0ms      popup mở, folder "Private" is_secure=true, cache trên đĩa = ENVELOPE (an toàn)',
    't=1200ms   user nhập passphrase → deriveKeyFromPassword (PBKDF2 310k) → key vào Pinia (RAM)',
    't=1210ms   unlockFolder → notes.loadAll() → server trả row ENCRYPTED → persistCache() ghi envelope ✓',
    't=1250ms   refreshDecryptedNotesAfterLoad (secureFolder.ts:93) decrypt vào notes.notes[i] (RAM)',
    't=1260ms   ↳ dòng cuối `await notes.persistCache()` (secureFolder.ts:124)',
    't=1261ms   persistCache (notes.ts:104) ghi notes.value + bodies.value — KHÔNG có guard is_secure',
    't=1262ms   ✗ chrome.storage.local giờ chứa PLAINTEXT title/label/content',
    't=45s      user đóng popup → RAM chết → CryptoKey biến mất (đúng thiết kế secureFolder.ts:20-23)',
    't=45s+1ms  ✗ nhưng plaintext trong LevelDB thì KHÔNG chết — lockAll() chỉ chạy ở onLogout (App.vue:254)',
    't=∞        %LOCALAPPDATA%\\...\\Extension State đọc được nội dung mà user chủ đích mã hóa',
    '           → đúng threat model secure folder sinh ra để chống, bị vô hiệu hoàn toàn',
  ]
  console.log(timeline.map((l) => `  ${l}`).join('\n'))
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT1 — src/utils/secureCache.ts: sealSecureRowsForCache (CODE THẬT)')
const SEAL_PATH = path.join(ROOT, 'src', 'utils', 'secureCache.ts')

// envelope giả, xác định được — thay cho AES-GCM thật
const ENVELOPE = 'retronote:1:'
const secureCryptoMock = {
  isEncryptedEnvelope: (v) => typeof v === 'string' && v.startsWith(ENVELOPE),
  encryptField: async (plain, key) =>
    `${ENVELOPE}${key.kid}:${Buffer.from(String(plain), 'utf8').toString('base64')}`,
}

let seal = null
try {
  const mod = loadTsModule(SEAL_PATH, { '@/utils/secureCrypto': secureCryptoMock })
  seal = mod.sealSecureRowsForCache
  check('T1.0 file tồn tại + export sealSecureRowsForCache', typeof seal === 'function',
    `sealSecureRowsForCache=${typeof seal}`)
} catch (e) {
  check('T1.0 file src/utils/secureCache.ts tồn tại và load được', false, e.message)
}

if (typeof seal === 'function') {
  const KEY = { kid: 'k1' }
  const isSecureFolder = (id) => id === 'F-SEC' || id === 'F-LOCKED'
  const getKey = (id) => (id === 'F-SEC' ? KEY : null) // F-LOCKED: secure nhưng KHÔNG có key

  const ALREADY_ENC = `${ENVELOPE}AAAAAAAAAAAAAAAA:QkJCQkJC`

  const notes = [
    { id: 'n1', folder_id: 'F-PLAIN', title: 'note thường' },
    { id: 'n2', folder_id: 'F-SEC', title: 'SECRET-TITLE' },
    { id: 'n3', folder_id: 'F-SEC', title: ALREADY_ENC },
    { id: 'n4', folder_id: 'F-LOCKED', title: 'LOCKED-PLAIN' },
    { id: 'n5', folder_id: null, title: 'không thuộc folder nào' },
  ]
  const bodies = [
    { id: 'b1', note_id: 'n1', label: 'l1', content: 'c1' },
    { id: 'b2', note_id: 'n2', label: 'SECRET-LABEL', content: 'SECRET-CONTENT' },
    { id: 'b3', note_id: 'n3', label: ALREADY_ENC, content: ALREADY_ENC },
    { id: 'b4', note_id: 'n4', label: 'LOCKED-BODY', content: 'LOCKED-BODY-CONTENT' },
    { id: 'b5', note_id: 'n2', label: ALREADY_ENC, content: 'MIXED-PLAIN' },
  ]

  const out = await seal({ notes, bodies, isSecureFolder, getKey })
  const N = Object.fromEntries((out.notes ?? []).map((n) => [n.id, n]))
  const B = Object.fromEntries((out.bodies ?? []).map((b) => [b.id, b]))
  const isEnv = secureCryptoMock.isEncryptedEnvelope
  const decode = (v) => Buffer.from(String(v).split(':').pop(), 'base64').toString('utf8')

  check('T1.1 folder thường: note đi qua NGUYÊN VẸN',
    N.n1 && N.n1.title === 'note thường' && N.n5 && N.n5.title === 'không thuộc folder nào',
    `n1=${JSON.stringify(N.n1)} n5=${JSON.stringify(N.n5)} — folder thường không được đụng`)

  check('T1.2 secure + plaintext + CÓ key: title thành envelope',
    N.n2 && isEnv(N.n2.title) && decode(N.n2.title) === 'SECRET-TITLE',
    `n2.title=${JSON.stringify(N.n2?.title)} — plaintext vẫn sẽ chạm đĩa`)

  check('T1.3 secure + ĐÃ envelope: giữ nguyên, KHÔNG encrypt chồng',
    N.n3 && N.n3.title === ALREADY_ENC,
    `n3.title=${JSON.stringify(N.n3?.title)} — encrypt 2 lần làm HỎNG dữ liệu không hồi phục`)

  check('T1.4 secure + plaintext + KHÔNG key: note bị loại khỏi bản ghi cache',
    N.n4 === undefined,
    `n4=${JSON.stringify(N.n4)} — thà mất edit chưa sync còn hơn ghi plaintext`)

  check('T1.5 body của note bị loại cũng bị loại',
    B.b4 === undefined,
    `b4=${JSON.stringify(B.b4)} — body mồ côi vẫn mang plaintext xuống đĩa`)

  check('T1.6 body secure plaintext: label + content đều thành envelope',
    B.b2 && isEnv(B.b2.label) && isEnv(B.b2.content) &&
      decode(B.b2.label) === 'SECRET-LABEL' && decode(B.b2.content) === 'SECRET-CONTENT',
    `b2=${JSON.stringify(B.b2)}`)

  check('T1.7 body hỗn hợp: label giữ nguyên envelope, content được mã hóa',
    B.b5 && B.b5.label === ALREADY_ENC && isEnv(B.b5.content) && decode(B.b5.content) === 'MIXED-PLAIN',
    `b5=${JSON.stringify(B.b5)} — nhánh một-field-plaintext bị bỏ sót`)

  check('T1.8 body của folder thường / đã envelope: nguyên vẹn',
    B.b1 && B.b1.content === 'c1' && B.b3 && B.b3.content === ALREADY_ENC,
    `b1=${JSON.stringify(B.b1)} b3=${JSON.stringify(B.b3)}`)

  check('T1.9 KHÔNG mutate input (RAM phải giữ plaintext để hiển thị)',
    notes[1].title === 'SECRET-TITLE' && bodies[1].content === 'SECRET-CONTENT',
    `notes[1].title=${JSON.stringify(notes[1].title)} — mutate làm UI folder đang unlock hiện envelope`)

  check('T1.10 dropped đếm đúng số row bị loại (n4 + b4 = 2)',
    out.dropped === 2,
    `dropped=${out.dropped}`)

  // Bất biến tổng quát — mạnh nhất: không một mẩu plaintext nào của secure folder lọt ra
  const SECRETS = ['SECRET-TITLE', 'SECRET-LABEL', 'SECRET-CONTENT', 'MIXED-PLAIN', 'LOCKED-PLAIN', 'LOCKED-BODY']
  const dumped = JSON.stringify({ notes: out.notes, bodies: out.bodies })
  const leaked = SECRETS.filter((s) => dumped.includes(s))
  check('T1.11 BẤT BIẾN: bản ghi cache không chứa plaintext nào của secure folder',
    leaked.length === 0,
    `rò rỉ: ${JSON.stringify(leaked)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW1/W2 — notes.ts persistCache ghi bản đã seal + decrypt lại sau merge')
const notesSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'notes.ts'), 'utf8')
const notesPersist = extractFn(notesSrc, 'persistCache')

check(
  'W1 persistCache gọi sealSecureRowsForCache và KHÔNG ghi thẳng notes.value',
  notesPersist !== null &&
    notesPersist.includes('sealSecureRowsForCache(') &&
    !notesPersist.includes('[NOTES_CACHE_KEY]: notes.value'),
  `body=${notesPersist ? notesPersist.replace(/\s+/g, ' ').slice(0, 200) : 'KHÔNG TÌM THẤY'}…`,
)

check(
  'W2 persistCache decrypt lại sau merge (bẫy mergeSnapshotWithStored kéo ciphertext vào RAM)',
  notesPersist !== null && notesPersist.includes('decryptLoadedSecureRows('),
  'thiếu bước decrypt-overlay → UI folder đang unlock sẽ hiện chuỗi retronote:1:…',
)

console.log('\nW3/W4 — secureFolder.ts tách decryptLoadedSecureRows khỏi persist')
const secureSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'secureFolder.ts'), 'utf8')
const decryptFn = extractFn(secureSrc, 'decryptLoadedSecureRows')

check(
  'W3 có decryptLoadedSecureRows và thân hàm KHÔNG gọi persistCache',
  decryptFn !== null && !decryptFn.includes('persistCache'),
  decryptFn === null
    ? 'chưa có async function decryptLoadedSecureRows( — vẫn là refreshDecryptedNotesAfterLoad tự ghi cache'
    : 'thân hàm còn gọi persistCache → persistCache gọi ngược lại = ĐỆ QUY',
)

const returnBlock = secureSrc.slice(secureSrc.lastIndexOf('  return {'))
check(
  'W4 store export decryptLoadedSecureRows',
  returnBlock.includes('decryptLoadedSecureRows'),
  'notes.ts persistCache không gọi được nếu store không export',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW5 — notes.ts loadAll: decrypt-overlay ở nhánh offline-return + catch')
const notesLoadAll = extractFn(notesSrc, 'loadAll')
const overlayCalls =
  notesLoadAll === null ? 0 : (notesLoadAll.match(/decryptLoadedSecureRows\(/g) ?? []).length

check(
  'W5 loadAll gọi decryptLoadedSecureRows ≥ 2 chỗ (sau hydrate + cuối catch) và notes.ts hết tham chiếu refreshDecryptedNotesAfterLoad',
  notesLoadAll !== null &&
    overlayCalls >= 2 &&
    !notesSrc.includes('refreshDecryptedNotesAfterLoad'),
  `overlayCalls=${overlayCalls}, cònTênCũ=${notesSrc.includes('refreshDecryptedNotesAfterLoad')} — ` +
    'nhánh !isOnline()/catch nạp envelope từ đĩa vào RAM mà không qua persistCache: ' +
    'unlock offline / fetch fail giữa phiên → folder đang unlock hiện retronote:1:…',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S1-secure-cache-leak.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix S1 đúng spec.')
