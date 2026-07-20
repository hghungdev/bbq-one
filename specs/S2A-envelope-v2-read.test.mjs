/**
 * FAILING TEST — S2A: envelope v2 (bbq:2:) + đọc-hai-chiều trong secureCrypto.ts.
 *
 * Chạy:   node specs/S2A-envelope-v2-read.test.mjs   (Node ≥ 20 — cần globalThis.crypto.subtle)
 *
 * RED trên code hiện tại:
 *   - T2 fail: chưa có ENVELOPE_V2_PREFIX / parseEnvelopeV2 / formatEnvelopeV2 / encryptFieldV2.
 *   - T3/T4/T6 fail: isEncryptedEnvelope chưa nhận v2, decryptField chưa đọc-hai-chiều.
 * GREEN sau khi áp specs/S2A-envelope-v2-read.spec.md.
 *
 * Chạy CODE THẬT: transpile src/utils/secureCrypto.ts (file không có import → không cần mock)
 * và dùng WebCrypto thật của Node — không mock crypto.
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

// ═════════════════════════════════════════════════════════════════════════════
console.log('THỨ TỰ MIGRATION — vì sao reader đi trước writer (minh họa, không assert)')
{
  const lines = [
    'S2A (spec này)  mọi reader nhận diện được bbq:2: — hệ CHƯA ghi v2, zero đổi hành vi',
    'S2B             wrapped_dek trong bảng user_crypto là chuỗi bbq:2: ĐẦU TIÊN của hệ',
    'S2C             data path bắt đầu GHI v2; đọc-hai-chiều đã có sẵn từ S2A → không big-bang',
    'vĩnh viễn       không bao giờ xóa reader v1 — backup của user vẫn còn dữ liệu retronote:1:',
  ]
  console.log(lines.map((l) => `  ${l}`).join('\n'))
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT1 — v1 compat: encryptField/decryptField hiện tại (phải PASS cả trước lẫn sau)')
const CRYPTO_PATH = path.join(ROOT, 'src', 'utils', 'secureCrypto.ts')
const m = loadTsModule(CRYPTO_PATH, {})

const salt = m.generateSalt16()
const KEY = await m.deriveKeyFromPassword('passphrase-t1', salt, 1_000)
const KEY2 = await m.deriveKeyFromPassword('passphrase-khac', salt, 1_000)

{
  const env = await m.encryptField('bí mật v1', KEY)
  const parts = env.split(':')
  check('T1.1 writer v1: retronote:1:<iv>:<ct> — đúng 4 segment',
    env.startsWith('retronote:1:') && parts.length === 4,
    `env=${env.slice(0, 40)}… segments=${parts.length}`)
  const back = await m.decryptField(env, KEY)
  check('T1.2 roundtrip v1 giữ nguyên', back === 'bí mật v1', `back=${JSON.stringify(back)}`)
  check('T1.3 isEncryptedEnvelope nhận v1', m.isEncryptedEnvelope(env) === true, `env=${env.slice(0, 30)}…`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — exports mới của S2A')
check('T2.1 ENVELOPE_V2_PREFIX === "bbq:2:"', m.ENVELOPE_V2_PREFIX === 'bbq:2:',
  `ENVELOPE_V2_PREFIX=${JSON.stringify(m.ENVELOPE_V2_PREFIX)}`)
check('T2.2 ENVELOPE_V2_ALG === "A256GCM"', m.ENVELOPE_V2_ALG === 'A256GCM',
  `ENVELOPE_V2_ALG=${JSON.stringify(m.ENVELOPE_V2_ALG)}`)
check('T2.3 parseEnvelopeV2 / formatEnvelopeV2 / encryptFieldV2 là function',
  typeof m.parseEnvelopeV2 === 'function' &&
    typeof m.formatEnvelopeV2 === 'function' &&
    typeof m.encryptFieldV2 === 'function',
  `parse=${typeof m.parseEnvelopeV2} format=${typeof m.formatEnvelopeV2} encV2=${typeof m.encryptFieldV2}`)

const hasV2 = typeof m.parseEnvelopeV2 === 'function' && typeof m.encryptFieldV2 === 'function'

if (hasV2) {
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nT3 — nhận diện strict: true cho ciphertext thật, false cho near-miss')
  const v2env = await m.encryptFieldV2('bí mật v2', KEY, 'k1')
  check('T3.1 isEncryptedEnvelope nhận output encryptFieldV2',
    m.isEncryptedEnvelope(v2env) === true, `v2env=${v2env.slice(0, 40)}…`)

  const nearMisses = [
    'bbq:2:',
    'bbq:2:hello',
    'bbq:2:A256GCM:k1:AAAAAAAAAAAAAAAA', // 5 segment, thiếu ct
    'bbq:2:A256GCM:k1:@@@@@@@@@@@@@@@@:QUJD', // iv sai base64
    'bbq:2:A256GCM:K1:AAAAAAAAAAAAAAAA:QUJD', // kid viết hoa
    'ghi chú bình thường của user',
  ]
  const wrong = nearMisses.filter((s) => m.isEncryptedEnvelope(s))
  check('T3.2 6 near-miss/plaintext đều KHÔNG bị coi là envelope',
    wrong.length === 0, `bị nhận nhầm: ${JSON.stringify(wrong)}`)

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nT4 — roundtrip v2 + parse đúng alg/kid')
  const parsed = m.parseEnvelopeV2(v2env)
  check('T4.1 parse ra alg=A256GCM, kid=k1',
    parsed !== null && parsed.alg === 'A256GCM' && parsed.kid === 'k1',
    `parsed=${JSON.stringify(parsed)}`)
  const backV2 = await m.decryptField(v2env, KEY)
  check('T4.2 decryptField đọc được v2', backV2 === 'bí mật v2', `back=${JSON.stringify(backV2)}`)

  console.log('\nT5 — sai key: decrypt v2 phải throw (GCM auth)')
  const r5 = await throws(() => m.decryptField(v2env, KEY2))
  check('T5.1 decrypt v2 bằng key khác → throw', r5.threw === true, r5.msg)

  console.log('\nT6 — alg lạ: là ciphertext với guard, nhưng KHÔNG decrypt bừa')
  const alien = m.formatEnvelopeV2('XCHACHA20', 'k1', 'AAAAAAAAAAAAAAAA', 'QUJDREVG')
  check('T6.1 isEncryptedEnvelope true cho alg lạ shape hợp lệ',
    m.isEncryptedEnvelope(alien) === true, `alien=${alien}`)
  const r6 = await throws(() => m.decryptField(alien, KEY), 'Unsupported')
  check('T6.2 decryptField throw "Unsupported envelope algorithm"', r6.threw === true, r6.msg)

  console.log('\nT7/T8/T9 — writer v1 bất biến, kid validation, parse↔format identity')
  const v1again = await m.encryptField('x', KEY)
  check('T7 encryptField vẫn ghi v1 (data path chưa đổi writer)',
    v1again.startsWith('retronote:1:'), `output=${v1again.slice(0, 30)}…`)

  const r8a = await throws(() => m.encryptFieldV2('x', KEY, 'K1 HOA'), 'kid')
  const r8b = await throws(async () => m.formatEnvelopeV2('A256GCM', 'kid có dấu cách', 'AAAAAAAAAAAAAAAA', 'QUJD'), 'kid')
  check('T8 kid sai format → encryptFieldV2/formatEnvelopeV2 throw',
    r8a.threw === true && r8b.threw === true, `encV2=${r8a.msg} | format=${r8b.msg}`)

  const p9 = m.parseEnvelopeV2(v2env)
  const re9 = m.formatEnvelopeV2(p9.alg, p9.kid, p9.ivB64, p9.ctB64)
  check('T9 parse → format trả lại đúng chuỗi gốc', re9 === v2env,
    `gốc=${v2env.slice(0, 44)}… | dựng lại=${re9.slice(0, 44)}…`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW1/W2/W3 — single source of truth + writer v1 không đổi (soi source)')
const cryptoSrc = fs.readFileSync(CRYPTO_PATH, 'utf8')
const sealSrc = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'secureCache.ts'), 'utf8')
const syncSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'sync.service.ts'), 'utf8')

check('W1 secureCache.ts import isEncryptedEnvelope từ @/utils/secureCrypto',
  sealSrc.includes("from '@/utils/secureCrypto'") && sealSrc.includes('isEncryptedEnvelope'),
  'S1 seal phải hưởng v2 tự động qua cùng một hàm')
check('W2 sync.service.ts import isEncryptedEnvelope từ @/utils/secureCrypto',
  syncSrc.includes("from '@/utils/secureCrypto'") && syncSrc.includes('isEncryptedEnvelope'),
  'push guard phải hưởng v2 tự động qua cùng một hàm')
check('W3 secureCrypto.ts còn literal retronote:1: và encryptField dùng ENVELOPE_PREFIX',
  cryptoSrc.includes("'retronote:1:'") && cryptoSrc.includes('`${ENVELOPE_PREFIX}${'),
  'writer v1 không được đổi ở S2A')

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2A-envelope-v2-read.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2A đúng spec.')
