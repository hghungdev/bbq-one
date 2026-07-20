/**
 * FAILING TEST — S2B: hạ tầng DEK/KEK + recovery key (accountCrypto.ts + service + migration).
 *
 * Chạy:   node specs/S2B-user-crypto-dek-kek.test.mjs   (Node ≥ 20 — cần WebCrypto)
 * Điều kiện: S2A đã GREEN (accountCrypto import parser/formatter v2 từ secureCrypto.ts).
 *
 * RED trên code hiện tại (3 fail):
 *   - T0 fail: src/utils/accountCrypto.ts chưa tồn tại.
 *   - W1 fail: supabase/migrations/015_user_crypto.sql chưa tồn tại.
 *   - W2 fail: src/services/userCrypto.service.ts chưa tồn tại.
 *   (W3 PASS sẵn: chưa store nào import — và PHẢI GIỮ NGUYÊN như vậy sau khi GREEN.)
 * GREEN sau khi áp specs/S2B-user-crypto-dek-kek.spec.md.
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

const b64 = (bytes) => Buffer.from(bytes).toString('base64')
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

// ═════════════════════════════════════════════════════════════════════════════
console.log('SƠ ĐỒ KHÓA — phần S2B phủ (minh họa, không assert)')
{
  const lines = [
    'passphrase ──PBKDF2(kdf_salt, kdf_params)──► KEK (RAM)  ──wrap──►  wrapped_dek (bbq:2:…)',
    'recovery 160-bit ──HKDF "bbq:recovery:v2"──► RKEK       ──wrap──►  wrapped_dek_recovery',
    'DEK 32B (RAM) ──HKDF──► K_content / K_index — data path CHƯA dùng, S2C mới wire',
    'đổi passphrase = wrap lại DEK = 1 UPDATE (so với O(n) network của changePassphrase v1)',
  ]
  console.log(lines.map((l) => `  ${l}`).join('\n'))
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT0 — src/utils/accountCrypto.ts tồn tại + load được (CODE THẬT, WebCrypto thật)')
const ACCT_PATH = path.join(ROOT, 'src', 'utils', 'accountCrypto.ts')
const secureCrypto = loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCrypto.ts'), {})

let A = null
try {
  A = loadTsModule(ACCT_PATH, { '@/utils/secureCrypto': secureCrypto })
  check('T0 export đủ API',
    typeof A.generateDekBytes === 'function' &&
      typeof A.deriveKekFromPassphrase === 'function' &&
      typeof A.wrapDek === 'function' &&
      typeof A.unwrapDek === 'function' &&
      typeof A.makeVerifier === 'function' &&
      typeof A.checkVerifier === 'function' &&
      typeof A.generateRecoveryKey === 'function' &&
      typeof A.parseRecoveryKey === 'function' &&
      typeof A.deriveRecoveryKek === 'function' &&
      typeof A.deriveContentKey === 'function' &&
      typeof A.deriveIndexKey === 'function',
    `thiếu export — có: ${Object.keys(A).join(', ')}`)
} catch (e) {
  check('T0 file src/utils/accountCrypto.ts tồn tại và load được', false, e.message)
}

if (A) {
  const salt = A.generateKdfSalt()
  const dek = A.generateDekBytes()
  const KEK = await A.deriveKekFromPassphrase('passphrase đúng', salt, { iterations: 1_000 })
  const KEK_SAI = await A.deriveKekFromPassphrase('passphrase sai', salt, { iterations: 1_000 })

  console.log('\nT1/T2/T3 — wrap/unwrap DEK')
  const wrapped = await A.wrapDek(dek, KEK, 'k1')
  const unwrapped = await A.unwrapDek(wrapped, KEK)
  check('T1 roundtrip: unwrap trả đúng 32 byte DEK gốc',
    unwrapped instanceof Uint8Array && sameBytes(unwrapped, dek),
    `unwrapped=${b64(unwrapped ?? new Uint8Array())} dek=${b64(dek)}`)

  const r2 = await throws(() => A.unwrapDek(wrapped, KEK_SAI))
  check('T2 KEK sai → unwrapDek throw (GCM auth)', r2.threw === true, r2.msg)

  const env = secureCrypto.parseEnvelopeV2 ? secureCrypto.parseEnvelopeV2(wrapped) : null
  check('T3.1 wrapped_dek là envelope v2 hợp lệ, alg=A256GCM, kid=k1',
    env !== null && env.alg === 'A256GCM' && env.kid === 'k1',
    `wrapped=${String(wrapped).slice(0, 44)}… parsed=${JSON.stringify(env)}`)
  check('T3.2 wrapped_dek KHÔNG chứa base64 của DEK thô',
    !wrapped.includes(b64(dek)),
    'DEK plaintext lộ ngay trong chuỗi wrap')

  console.log('\nT4 — verifier: đúng → true; sai → false (KHÔNG throw)')
  const verifier = await A.makeVerifier(KEK)
  check('T4.1 checkVerifier đúng KEK → true', (await A.checkVerifier(verifier, KEK)) === true,
    `verifier=${verifier.slice(0, 40)}…`)
  let v4 = null
  try {
    v4 = await A.checkVerifier(verifier, KEK_SAI)
  } catch (e) {
    v4 = `THREW: ${e.message}`
  }
  check('T4.2 checkVerifier sai KEK → false, không throw', v4 === false, `kết quả=${JSON.stringify(v4)}`)

  console.log('\nT5/T6 — recovery key 160-bit: format, parse chịu lỗi nhập, hành trình đầy đủ')
  const rec = A.generateRecoveryKey()
  check('T5.1 display đúng 8 nhóm 4 ký tự base32',
    /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/.test(rec.display) && rec.bytes.length === 20,
    `display=${rec.display} bytes=${rec.bytes.length}`)
  check('T5.2 parse(display) == bytes gốc',
    sameBytes(A.parseRecoveryKey(rec.display), rec.bytes), `display=${rec.display}`)
  const sloppy = rec.display.toLowerCase().replace(/-/g, ' ')
  check('T5.3 parse chịu chữ thường + khoảng trắng thay dấu gạch',
    sameBytes(A.parseRecoveryKey(sloppy), rec.bytes), `input=${sloppy.slice(0, 24)}…`)
  const r5a = await throws(async () => A.parseRecoveryKey('ABCD-EFGH'))
  const r5b = await throws(async () => A.parseRecoveryKey(rec.display.replace(/[A-Z2-7]/, '1')))
  check('T5.4 reject sai độ dài / ký tự ngoài base32 (throw)',
    r5a.threw === true && r5b.threw === true, `ngắn=${r5a.msg} | ký tự lạ=${r5b.msg}`)

  const RKEK = await A.deriveRecoveryKek(rec.bytes)
  const wrappedRec = await A.wrapDek(dek, RKEK, 'k1')
  const RKEK2 = await A.deriveRecoveryKek(A.parseRecoveryKey(rec.display))
  const dekBack = await A.unwrapDek(wrappedRec, RKEK2)
  check('T6 hành trình recovery: display → parse → RKEK → unwrap ra đúng DEK',
    sameBytes(dekBack, dek), `dekBack=${b64(dekBack)}`)

  console.log('\nT7 — domain separation: K_content ≠ K_index')
  const kContent = await A.deriveContentKey(dek)
  const kIndex = await A.deriveIndexKey(dek)
  const iv0 = new Uint8Array(12) // IV cố định CHỈ để so sánh khóa trong test
  const plain = new TextEncoder().encode('cùng một plaintext')
  const c1 = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv0 }, kContent, plain))
  const c2 = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv0 }, kIndex, plain))
  check('T7 cùng plaintext + cùng IV → ciphertext KHÁC nhau (khóa đã tách)',
    !sameBytes(c1, c2), 'HKDF info không tách khóa — lộ K_index là lộ luôn content')

  console.log('\nT8/T9/T10 — toàn vẹn, tham số KDF, CSPRNG')
  const idx = wrapped.lastIndexOf(':') + 5
  const flipped =
    wrapped.slice(0, idx) + (wrapped[idx] === 'A' ? 'B' : 'A') + wrapped.slice(idx + 1)
  const r8 = await throws(() => A.unwrapDek(flipped, KEK))
  check('T8 tamper 1 ký tự ct → unwrap throw (GCM integrity)', r8.threw === true, r8.msg)

  const KEK_2000 = await A.deriveKekFromPassphrase('passphrase đúng', salt, { iterations: 2_000 })
  const r9 = await throws(() => A.unwrapDek(wrapped, KEK_2000))
  check('T9 iterations khác → KEK khác → unwrap throw (kdf_params có tác dụng)',
    r9.threw === true, r9.msg)

  const dek2 = A.generateDekBytes()
  check('T10 DEK 32B, salt 16B, hai lần sinh khác nhau',
    dek.length === 32 && salt.length === 16 && !sameBytes(dek, dek2),
    `dek=${dek.length}B salt=${salt.length}B trùng=${sameBytes(dek, dek2)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW1 — supabase/migrations/015_user_crypto.sql')
const SQL_PATH = path.join(ROOT, 'supabase', 'migrations', '015_user_crypto.sql')
let sql = null
try {
  sql = fs.readFileSync(SQL_PATH, 'utf8')
} catch {
  /* chưa tồn tại */
}
const sqlNeeds = [
  'user_crypto',
  'kdf_params',
  'kdf_salt',
  'dek_id',
  'wrapped_dek',
  'wrapped_dek_recovery',
  'verifier',
  "'pbkdf2-sha256'",
  '600000',
  'ENABLE ROW LEVEL SECURITY',
  'auth.uid() = user_id',
  'retronote_update_updated_at',
]
const sqlMissing = sql === null ? sqlNeeds : sqlNeeds.filter((s) => !sql.includes(s))
check('W1 migration tồn tại + đủ cột/RLS/trigger/default',
  sql !== null && sqlMissing.length === 0,
  sql === null ? 'file chưa tồn tại' : `thiếu: ${JSON.stringify(sqlMissing)}`)

console.log('\nW2 — src/services/userCrypto.service.ts đúng pattern bookmarkCryptoKeys')
const SVC_PATH = path.join(ROOT, 'src', 'services', 'userCrypto.service.ts')
let svc = null
try {
  svc = fs.readFileSync(SVC_PATH, 'utf8')
} catch {
  /* chưa tồn tại */
}
check('W2 service tồn tại: from(user_crypto) + auth.getUser + onConflict user_id, không service_role',
  svc !== null &&
    svc.includes(".from('user_crypto')") &&
    svc.includes('supabase.auth.getUser()') &&
    svc.includes("onConflict: 'user_id'") &&
    !svc.includes('service_role'),
  svc === null ? 'file chưa tồn tại' : 'thiếu pattern bắt buộc hoặc dính service_role')

console.log('\nW3 — ranh giới tầng: util crypto thuần + service có OWNER duy nhất')
// Lịch sử (2026-07-20): bản S2B gốc assert "Phase 2a chưa store nào được wire". S2C1 lấy chính
// wiring làm deliverable nên ràng buộc đó được GỠ CÓ CHỦ ĐÍCH (ghi trong spec S2C1, thay đổi
// 10/10) — KHÔNG phải nới test cho dễ xanh. Bản thay thế đúng ở CẢ trước lẫn sau S2C1 và vẫn
// bắt được over-reach thật: crypto util không được kéo store/service; service chỉ có 1 owner.
const acctUtilSrc = fs.readFileSync(ACCT_PATH, 'utf8')
const utilPure = !acctUtilSrc.includes('@/stores/') && !acctUtilSrc.includes('@/services/')

function walkSrc(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkSrc(p))
    else if (/\.(ts|vue)$/.test(e.name)) out.push(p)
  }
  return out
}
const OWNER = ['src/services/userCrypto.service.ts', 'src/stores/accountCrypto.ts']
const strayImporters = walkSrc(path.join(ROOT, 'src'))
  .filter((p) => fs.readFileSync(p, 'utf8').includes('userCrypto.service'))
  .map((p) => path.relative(ROOT, p).replace(/\\/g, '/'))
  .filter((p) => !OWNER.includes(p))

check(
  'W3 accountCrypto.ts thuần util (không import store/service) + userCrypto.service chỉ do stores/accountCrypto.ts dùng',
  utilPure && strayImporters.length === 0,
  `utilPure=${utilPure} importer lạ=${JSON.stringify(strayImporters)} — service phải có đúng 1 owner`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2B-user-crypto-dek-kek.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2B đúng spec.')
