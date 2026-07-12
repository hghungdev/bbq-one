/**
 * FAILING TEST — N1 (+N8): quota 10MB chrome.storage.local → mất offline edit im lặng.
 *
 * Chạy:   node specs/N1-storage-quota.test.mjs
 *
 * RED trên code hiện tại:
 *   - T1 fail: src/utils/cacheWrite.ts chưa tồn tại.
 *   - W1 fail: manifest không có "unlimitedStorage" (bị gỡ ở commit 4f80eee).
 *   - W2 fail: docs/CHROME-STORE-PERMISSIONS.md chưa có justification.
 *   - W3/W4/W5 fail: persistCache các store vẫn gọi thẳng chrome.storage.local.set.
 * GREEN sau khi áp specs/N1-storage-quota.spec.md.
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

// ═════════════════════════════════════════════════════════════════════════════
// TIMELINE MINH HỌA (không assert) — pattern ghi hiện tại chết thế nào ở 10MB
// ═════════════════════════════════════════════════════════════════════════════
const QUOTA_BYTES = 10_485_760 // chrome.storage.local.QUOTA_BYTES khi KHÔNG có unlimitedStorage
const NOTE_ROW_BYTES = 350 // id/user_id uuid + title + tags + 3 timestamp + keys
const BODY_ROW_BYTES = 5_200 // content 5KB + metadata
const PER_NOTE = NOTE_ROW_BYTES + BODY_ROW_BYTES
const BREAK_AT = Math.floor(QUOTA_BYTES / PER_NOTE)

console.log('TIMELINE — mô phỏng pattern persistCache hiện tại (notes.ts:103-108) sát trần quota')
console.log(`  quota=${QUOTA_BYTES}B, mỗi note+body ≈ ${PER_NOTE}B → điểm gãy ≈ ${BREAK_AT} notes`)
{
  const used = BREAK_AT * PER_NOTE // cache đang chứa BREAK_AT notes (sát trần)
  const timeline = []
  timeline.push(`t=0ms     popup: user OFFLINE sửa body note #${BREAK_AT} (edit nằm trong RAM)`)
  timeline.push('t=2000ms  NoteEditor.scheduleSave → updateBody → catch offline (notes.ts:338-355)')
  timeline.push('t=2001ms  bodies.value[idx] = {...edit} (in-memory OK) → await persistCache()')
  const attempted = used + PER_NOTE // user vừa tạo thêm 1 note trước đó → vượt trần
  if (attempted > QUOTA_BYTES) {
    timeline.push(
      `t=2002ms  chrome.storage.local.set THROW "QUOTA_BYTES quota exceeded" (${attempted}B > ${QUOTA_BYTES}B)`,
    )
    timeline.push('t=2003ms  scheduleSave (NoteEditor.vue:92-101) KHÔNG có try/catch → unhandled rejection')
    timeline.push('t=2004ms  KHÔNG toast, KHÔNG loadError — user thấy như đã lưu')
    timeline.push('t=5000ms  user đóng popup → RAM chết → OFFLINE EDIT MẤT VĨNH VIỄN')
  }
  console.log(timeline.map((l) => `  ${l}`).join('\n'))
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT1 — src/utils/cacheWrite.ts: safeCacheWrite + stripEncryptedBackupTrees (CODE THẬT)')
const UTIL_PATH = path.join(ROOT, 'src', 'utils', 'cacheWrite.ts')
let util = null
try {
  util = loadTsModule(UTIL_PATH)
} catch (e) {
  check('T1.0 file src/utils/cacheWrite.ts tồn tại và load được', false, e.message)
}
if (util) {
  const { safeCacheWrite, stripEncryptedBackupTrees } = util
  check('T1.0 export safeCacheWrite + stripEncryptedBackupTrees',
    typeof safeCacheWrite === 'function' && typeof stripEncryptedBackupTrees === 'function',
    `safeCacheWrite=${typeof safeCacheWrite}, stripEncryptedBackupTrees=${typeof stripEncryptedBackupTrees}`)

  // mock chrome.storage.local có quota
  let quotaMode = true
  globalThis.chrome = {
    storage: {
      local: {
        async set() {
          if (quotaMode) throw new Error('QUOTA_BYTES quota exceeded')
        },
      },
    },
  }

  // 1a. quota error → return false + onError được gọi + KHÔNG throw
  let onErrorArg = null
  let returned = null
  let threw = false
  try {
    returned = await safeCacheWrite({ k: 'v' }, (e) => { onErrorArg = e })
  } catch {
    threw = true
  }
  check('T1.1 quota error: KHÔNG throw', !threw, 'safeCacheWrite throw — offline edit vẫn chết như cũ')
  check('T1.2 quota error: return false', returned === false, `returned=${returned}`)
  check('T1.3 quota error: onError nhận error', onErrorArg instanceof Error, `onErrorArg=${onErrorArg}`)

  // 1b. onError tự throw cũng không được làm safeCacheWrite throw
  threw = false
  try {
    await safeCacheWrite({ k: 'v' }, () => { throw new Error('boom') })
  } catch {
    threw = true
  }
  check('T1.4 onError throw → safeCacheWrite vẫn không throw', !threw, 'onError leak exception ra ngoài')

  // 1c. success → return true
  quotaMode = false
  returned = await safeCacheWrite({ k: 'v' })
  check('T1.5 ghi thành công: return true', returned === true, `returned=${returned}`)

  // 1d. stripEncryptedBackupTrees
  const plain = { id: 'p', encrypted: false, tree_json: [{ id: '1' }] }
  const enc = { id: 'e', encrypted: true, tree_json: [{ id: '2', title: 'secret' }] }
  const input = [plain, enc]
  const out = stripEncryptedBackupTrees(input)
  check('T1.6 backup thường giữ nguyên tree',
    out[0].tree_json.length === 1 && out[0].tree_json[0].id === '1',
    JSON.stringify(out[0]))
  check('T1.7 backup encrypted bị strip tree (không cache plaintext)',
    Array.isArray(out[1].tree_json) && out[1].tree_json.length === 0,
    `tree_json=${JSON.stringify(out[1].tree_json)} — plaintext PIN-protected vẫn chạm đĩa`)
  check('T1.8 không mutate input',
    enc.tree_json.length === 1,
    'mảng gốc bị sửa — backups.value trong RAM mất tree, UI online vỡ')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW1 — public/manifest.json có "unlimitedStorage"')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8'))
check(
  'W1 permissions chứa unlimitedStorage',
  Array.isArray(manifest.permissions) && manifest.permissions.includes('unlimitedStorage'),
  `permissions=${JSON.stringify(manifest.permissions)} — cap 10MB còn nguyên, điểm gãy ~${BREAK_AT} notes`,
)

console.log('\nW2 — docs/CHROME-STORE-PERMISSIONS.md có justification unlimitedStorage')
const permsDoc = fs.readFileSync(path.join(ROOT, 'docs', 'CHROME-STORE-PERMISSIONS.md'), 'utf8')
check(
  'W2 docs nhắc tới unlimitedStorage',
  permsDoc.includes('unlimitedStorage'),
  'docs là source-of-truth cho form CWS — thiếu justification sẽ vướng review',
)

// ═════════════════════════════════════════════════════════════════════════════
// W3/W4/W5 — wiring: persistCache các store phải qua safeCacheWrite
function extractFn(src, fnName) {
  const start = src.indexOf(`async function ${fnName}(`)
  if (start === -1) return null
  // cắt tới dấu đóng hàm theo đếm ngoặc nhọn
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

console.log('\nW3 — notes.ts persistCache dùng safeCacheWrite')
const notesSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'notes.ts'), 'utf8')
const notesPersist = extractFn(notesSrc, 'persistCache')
check(
  'W3 persistCache(notes) gọi safeCacheWrite, không gọi thẳng chrome.storage.local.set',
  notesPersist !== null &&
    notesPersist.includes('safeCacheWrite(') &&
    !notesPersist.includes('chrome.storage.local.set'),
  `body=${notesPersist ? notesPersist.replace(/\s+/g, ' ').slice(0, 120) : 'KHÔNG TÌM THẤY'}…`,
)

console.log('\nW4 — calendarEvents.ts persistCache dùng safeCacheWrite')
const calSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'calendarEvents.ts'), 'utf8')
const calPersist = extractFn(calSrc, 'persistCache')
check(
  'W4 persistCache(calendar) gọi safeCacheWrite, không gọi thẳng chrome.storage.local.set',
  calPersist !== null &&
    calPersist.includes('safeCacheWrite(') &&
    !calPersist.includes('chrome.storage.local.set'),
  `body=${calPersist ? calPersist.replace(/\s+/g, ' ').slice(0, 120) : 'KHÔNG TÌM THẤY'}…`,
)

console.log('\nW5 — bookmarks.ts persistBackupsCache dùng safeCacheWrite + stripEncryptedBackupTrees')
const bmSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'bookmarks.ts'), 'utf8')
const bmPersist = extractFn(bmSrc, 'persistBackupsCache')
check(
  'W5 persistBackupsCache gọi safeCacheWrite + stripEncryptedBackupTrees',
  bmPersist !== null &&
    bmPersist.includes('safeCacheWrite(') &&
    bmPersist.includes('stripEncryptedBackupTrees(') &&
    !bmPersist.includes('chrome.storage.local.set'),
  `body=${bmPersist ? bmPersist.replace(/\s+/g, ' ').slice(0, 140) : 'KHÔNG TÌM THẤY'}…`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/N1-storage-quota.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix N1(+N8) đúng spec.')
