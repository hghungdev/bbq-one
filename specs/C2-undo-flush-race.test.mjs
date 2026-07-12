/**
 * FAILING TEST — C2: SW top-level flush xóa server-side ngay trong undo window 5s.
 *
 * Chạy:   node specs/C2-undo-flush-race.test.mjs
 * Smoke:  node specs/C2-undo-flush-race.test.mjs <path-to-alt-impl.ts>   (kiểm tra một bản
 *         implement theo spec trước khi sửa source thật)
 *
 * Test transpile và THỰC THI CODE THẬT của src/services/pendingDeleteCommit.service.ts
 * (dùng package `typescript` có sẵn trong devDependencies) — không phải bản copy.
 * Mock: chrome.storage.local (in-memory) + 3 service delete (recorder).
 *
 * Hằng số timing thật từ source:
 *   - undo window: DEFAULT_UNDO_MS = 5_000 (src/stores/undoToast.ts:27)
 *   - SW cold-start: mô phỏng 120ms (thực tế 50–300ms — evaluate module graph gồm supabase-js);
 *     assertion KHÔNG phụ thuộc giá trị sleep, chỉ cần flush chạy trước expiresAt.
 *
 * RED trên code hiện tại: case A1 + A6 fail (A1: server delete bắn ở t≈120ms dù undo window mở tới t=5000ms;
 * A6: undoToast.ts:77 chỉ truyền 1 tham số). A2–A5 pin invariant.
 * GREEN sau khi áp specs/C2-undo-flush-race.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

const SERVICE_PATH =
  process.argv[2] ?? path.join(ROOT, 'src', 'services', 'pendingDeleteCommit.service.ts')
const CONSTANTS_PATH = path.join(ROOT, 'src', 'constants', 'storage.ts')

// ── transpile + evaluate 1 file TS như CommonJS, mock import theo specifier ──
function loadTsModule(filePath, mocks) {
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

// ── mock chrome.storage.local (async như thật) ───────────────────────────────
const store = new Map()
const tick = () => new Promise((r) => setTimeout(r, 1))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        await tick()
        return { [key]: store.get(key) }
      },
      async set(obj) {
        await tick()
        for (const [k, v] of Object.entries(obj)) store.set(k, v)
      },
      async remove(key) {
        await tick()
        store.delete(key)
      },
    },
  },
}

// ── recorder: mọi "server delete" đi qua đây ─────────────────────────────────
let t0 = Date.now()
const elapsed = () => Date.now() - t0
let deleted = []
const timeline = []
const log = (msg) => timeline.push(`t=${elapsed()}ms  ${msg}`)
const recordDelete = (kind) => async (id) => {
  deleted.push({ kind, id })
  log(`SERVER DELETE ${kind} id=${id}`)
}

// constants thật (để dùng đúng key BBQ_PENDING_DELETE_COMMITS_KEY của source)
const constants = loadTsModule(CONSTANTS_PATH, {})
const KEY = constants.BBQ_PENDING_DELETE_COMMITS_KEY
const webLock = loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'), {})

// service thật, mock 3 repo services
const svc = loadTsModule(SERVICE_PATH, {
  '@/constants/storage': constants,
  '@/utils/webLock': webLock,
  '@/services/bookmarks.service': { bookmarksService: { deleteBackup: recordDelete('bookmark-backup') } },
  '@/services/calendarEvents.service': { calendarEventsService: { delete: recordDelete('calendar') } },
  '@/services/notes.service': { notesService: { delete: recordDelete('note') } },
})

const {
  registerPendingDeleteCommit,
  unregisterPendingDeleteCommit,
  flushOrphanedPendingDeleteCommits,
} = svc

// queue ids bất kể format (legacy string | object {id, expiresAt})
function queueIds() {
  const raw = store.get(KEY)
  if (!Array.isArray(raw)) return []
  return raw
    .map((e) => (typeof e === 'string' ? e : e && typeof e === 'object' ? e.id : null))
    .filter(Boolean)
}
function resetCase() {
  store.clear()
  deleted = []
  t0 = Date.now()
}

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}

const UNDO_MS = 5_000 // DEFAULT_UNDO_MS, src/stores/undoToast.ts:27

// ═════════════════════════════════════════════════════════════════════════════
console.log('CASE A1 — undo window ĐANG MỞ, SW cold-start chạy top-level flush (respect-expiry)')
resetCase()
log('popup: user bấm Delete → persistCache() ghi storage (storage.onChanged đánh thức SW đang ngủ)')
await registerPendingDeleteCommit('calendar:aaaa-1111', Date.now() + UNDO_MS) // undoToast.ts:77 (sau fix)
log(`popup: registerPendingDeleteCommit('calendar:aaaa-1111') — undo window MỞ tới t=${UNDO_MS}ms`)
await sleep(120) // SW cold-start: evaluate module graph (supabase-js, ...) rồi tới background.ts:107
log("SW: top-level `void flushOrphanedPendingDeleteCommits('respect-expiry')` (background.ts:107)")
await flushOrphanedPendingDeleteCommits('respect-expiry')
log('popup: (t=2s) user bấm UNDO — nhưng nếu server delete đã bắn thì undo chỉ còn là ảo giác')
console.log(timeline.join('\n'))

const a1Deleted = deleted.some((d) => d.id === 'aaaa-1111')
check(
  'A1.1 KHÔNG có server delete khi undo window còn mở',
  !a1Deleted,
  `calendar event aaaa-1111 bị xóa server-side ở t≈120ms trong khi undo window mở tới t=${UNDO_MS}ms. ` +
    'Undo sau đó restore bản local SẠCH (updated_at <= synced_at) → không bao giờ push lại → ' +
    'lần loadAll() online kế tiếp pull server (không còn row) đè cache → MẤT VĨNH VIỄN dù UI báo undo OK.',
)
check(
  'A1.2 entry vẫn nằm trong queue chờ popup commit/undo',
  queueIds().includes('calendar:aaaa-1111'),
  `queue sau flush = ${JSON.stringify(queueIds())} — entry bị lấy ra và thực thi sớm`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nCASE A2 — legacy string entry (ghi bởi bản production cũ) phải được coi là ĐÃ hết hạn')
resetCase()
store.set(KEY, ['note:bbbb']) // format cũ: string, không có expiresAt
await flushOrphanedPendingDeleteCommits('respect-expiry')
check(
  'A2 legacy string entry được flush ngay cả ở respect-expiry',
  deleted.some((d) => d.kind === 'note' && d.id === 'bbbb'),
  'entry legacy không được xử lý — delete của user bị kẹt vĩnh viễn sau khi update extension',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nCASE A3 — entry ĐÃ quá hạn (orphan thật: popup chết giữa undo window) vẫn được dọn')
resetCase()
await registerPendingDeleteCommit('calendar:cccc', Date.now() - 2_000) // quá hạn > grace 1s
await flushOrphanedPendingDeleteCommits('respect-expiry')
check(
  'A3 orphan quá hạn được execute ở respect-expiry',
  deleted.some((d) => d.id === 'cccc'),
  'orphan không được dọn — row đã xóa trong UI sẽ revert ở popup kế tiếp',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nCASE A4 — flush KHÔNG tham số (App.vue:166 mount + message handler) giữ semantics force')
resetCase()
await registerPendingDeleteCommit('calendar:dddd', Date.now() + UNDO_MS)
await flushOrphanedPendingDeleteCommits() // đúng cách gọi hiện có ở 2 call site không-được-đổi
check(
  'A4 force-mode (default) xóa cả entry chưa hết hạn',
  deleted.some((d) => d.id === 'dddd'),
  'default mode bị đổi — popup mount sẽ không chốt được delete của phiên trước (revert bug quay lại)',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nCASE A5 — đường UNDO: unregister gỡ entry, flush sau đó không xóa gì')
resetCase()
await registerPendingDeleteCommit('note:eeee', Date.now() + UNDO_MS)
await unregisterPendingDeleteCommit('note:eeee')
check('A5.1 queue rỗng sau unregister', queueIds().length === 0, `queue = ${JSON.stringify(queueIds())}`)
await flushOrphanedPendingDeleteCommits('respect-expiry')
check(
  'A5.2 không có delete nào sau undo',
  !deleted.some((d) => d.id === 'eeee'),
  'note eeee bị xóa server-side dù user đã undo',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nCASE A6 — wiring: undoToast.ts phải TRUYỀN expiresAt vào register (không được để bug sống mà test vẫn xanh)')
const undoSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'undoToast.ts'), 'utf8')
const registerCalls = [...undoSrc.matchAll(/\bregisterPendingDeleteCommit\(([^)]*)\)/g)]
const call = registerCalls[0]
check(
  'A6 undoToast.ts gọi registerPendingDeleteCommit với 2 tham số (id, expiresAt)',
  registerCalls.length > 0 && registerCalls.every((m) => m[1].includes(',')),
  `call site = ${call ? call[0] : 'KHÔNG TÌM THẤY'} — thiếu expiresAt → entry luôn expired → C2 vẫn còn bug`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C2-undo-flush-race.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix C2 đúng spec.')
