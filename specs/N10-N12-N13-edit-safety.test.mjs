/**
 * FAILING TEST — N10+N12+N13: autosave nuốt lỗi khi note bị xóa từ máy khác,
 * draft chết vì clock skew, offscreen clipboard race.
 *
 * Chạy:   node specs/N10-N12-N13-edit-safety.test.mjs
 *
 * RED trên code hiện tại:
 *   - T-N12 fail: shouldApplyDraft bỏ qua baselineUpdatedAt (chưa có field).
 *   - T-N10 fail: isRowMissingOnServerError chưa export từ syncConflict.ts.
 *   - W-N10 fail: 3 đường save của NoteEditor chưa có try/catch.
 *   - W-N12/W-N13 fail: chưa wire.
 * GREEN sau khi áp specs/N10-N12-N13-edit-safety.spec.md.
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

// ── mock chrome.storage (local + session) ────────────────────────────────────
const sessionStore = new Map()
const localStoreMap = new Map()
globalThis.chrome = {
  storage: {
    session: {
      async get(key) {
        return sessionStore.has(key) ? { [key]: sessionStore.get(key) } : {}
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) sessionStore.set(k, v)
      },
      async remove(key) {
        sessionStore.delete(key)
      },
    },
    local: {
      async get(keys) {
        const list = Array.isArray(keys) ? keys : [keys]
        const out = {}
        for (const k of list) if (localStoreMap.has(k)) out[k] = localStoreMap.get(k)
        return out
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) localStoreMap.set(k, v)
      },
      async remove(keys) {
        const list = Array.isArray(keys) ? keys : [keys]
        for (const k of list) localStoreMap.delete(k)
      },
    },
  },
}

// ═════════════════════════════════════════════════════════════════════════════
// TIMELINE MINH HỌA — vòng chết N10 (không assert)
// ═════════════════════════════════════════════════════════════════════════════
console.log('TIMELINE — N10, máy B xóa note X trên server trong khi máy A đang gõ X:')
console.log('  t=0ms     máy B: DELETE notes WHERE id=X (server row biến mất)')
console.log('  t=2000ms  máy A: debounce-save → RPC NOT FOUND → BBQ_CONFLICT → refetch .single() → PGRST116 throw')
console.log('  t=2001ms  scheduleSave (NoteEditor.vue) KHÔNG catch → unhandled rejection — user không thấy gì')
console.log('  t=4000ms  user gõ tiếp → save 2s kế tiếp → lại throw → lại câm')
console.log('  t=∞       mọi keystroke sau lần pull cuối chết trong vòng lặp im lặng')

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT-N12 — shouldApplyDraft (CODE THẬT noteDraft.service.ts): baseline miễn nhiễm clock skew')
{
  const constants = loadTsModule(path.join(ROOT, 'src', 'constants', 'storage.ts'))
  const draftSvc = loadTsModule(path.join(ROOT, 'src', 'services', 'noteDraft.service.ts'), {
    '@/constants/storage': constants,
  })
  const { shouldApplyDraft, saveNoteDraft, readNoteDraft } = draftSvc

  // Case chính (RED): client CHẬM 5 phút. Body chưa đổi từ lúc gõ (baseline khớp updated_at)
  // → draft là bản mới nhất, PHẢI được áp — bất kể draft.at "cũ hơn" updated_at theo đồng hồ.
  const SERVER_TS = '2026-07-13T10:05:00.000Z' // updated_at server (sau autosave 2s thành công)
  const draftClockSkew = {
    bodyId: 'body-1',
    noteId: 'note-1',
    content: '<p>30 giây keystroke cuối trước khi popup bị kill</p>',
    at: '2026-07-13T10:00:30.000Z', // client chậm 5' — "cũ hơn" server 4'30"
    baselineUpdatedAt: SERVER_TS, // body CHƯA đổi từ lúc gõ
  }
  check(
    'T-N12.1 client chậm 5\': baseline khớp → PHẢI áp draft',
    shouldApplyDraft(draftClockSkew, { id: 'body-1', updated_at: SERVER_TS }) === true,
    'draft bị clearNoteDraft() vứt im lặng — mất 30s keystroke cuối, đúng ca C8.1 sinh ra để cứu',
  )

  // Pin fallback legacy: draft KHÔNG có baseline + draft.at mới hơn → true (giữ hành vi cũ)
  const legacyNewer = {
    bodyId: 'body-1',
    noteId: 'note-1',
    content: 'x',
    at: '2026-07-13T10:06:00.000Z',
  }
  check(
    'T-N12.2 legacy draft (không baseline) + at mới hơn → true',
    shouldApplyDraft(legacyNewer, { id: 'body-1', updated_at: SERVER_TS }) === true,
    'fallback thời gian bị phá — draft legacy chết',
  )

  // Pin: body ĐÃ đổi (máy khác thắng) + draft.at cũ hơn → false
  const staleDraft = {
    bodyId: 'body-1',
    noteId: 'note-1',
    content: 'x',
    at: '2026-07-13T10:00:00.000Z',
    baselineUpdatedAt: '2026-07-13T09:00:00.000Z', // baseline KHÁC updated_at hiện tại
  }
  check(
    'T-N12.3 body đã đổi + draft cũ hơn → false',
    shouldApplyDraft(staleDraft, { id: 'body-1', updated_at: SERVER_TS }) === false,
    'draft cũ đè bản mới từ máy khác',
  )

  // Pin: khác bodyId → false
  check(
    'T-N12.4 khác bodyId → false',
    shouldApplyDraft(draftClockSkew, { id: 'body-KHAC', updated_at: SERVER_TS }) === false,
    '',
  )

  // Roundtrip: save → read giữ nguyên baselineUpdatedAt
  await saveNoteDraft(draftClockSkew)
  const back = await readNoteDraft()
  check(
    'T-N12.5 roundtrip giữ baselineUpdatedAt',
    back !== null && back.baselineUpdatedAt === SERVER_TS,
    `read về: ${JSON.stringify(back)?.slice(0, 100)}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT-N10 — isRowMissingOnServerError (CODE THẬT syncConflict.ts)')
{
  const webLockReal = loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'), {})
  const sc = loadTsModule(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), {
    '@/utils/webLock': webLockReal,
  })
  if (typeof sc.isRowMissingOnServerError !== 'function') {
    check('T-N10.0 export isRowMissingOnServerError', false,
      'chưa tồn tại — NoteEditor không phân biệt được "note bị xóa trên máy khác" với lỗi thường')
  } else {
    const f = sc.isRowMissingOnServerError
    check('T-N10.1 code PGRST116 → true', f({ code: 'PGRST116', message: 'x' }) === true, '')
    check('T-N10.2 message "multiple (or no) rows returned" → true',
      f(new Error('JSON object requested, multiple (or no) rows returned')) === true, '')
    check('T-N10.3 SyncConflictError thường → false', f(new sc.SyncConflictError()) === false,
      'conflict thường (row còn tồn tại) bị nhận nhầm là deleted')
    check('T-N10.4 network error → false', f(new Error('Failed to fetch')) === false, '')
  }
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring checks')
const editorSrc = fs.readFileSync(
  path.join(ROOT, 'src', 'components', 'notes', 'NoteEditor.vue'), 'utf8')
const bgSrc = fs.readFileSync(path.join(ROOT, 'src', 'background.ts'), 'utf8')
const webLockSrc = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'webLock.ts'), 'utf8')

// W-N10.1: MỌI `await notesStore.updateBody(` trong NoteEditor phải nằm trong try
{
  const calls = [...editorSrc.matchAll(/await notesStore\.updateBody\(/g)]
  const inTry = calls.filter((m) => {
    const before = editorSrc.slice(Math.max(0, m.index - 300), m.index)
    return before.lastIndexOf('try {') > before.lastIndexOf('catch')
  })
  check(
    `W-N10.1 cả ${calls.length} chỗ await updateBody đều trong try (hiện ${inTry.length}/${calls.length})`,
    calls.length >= 3 && inTry.length === calls.length,
    'save chết câm khi note bị xóa từ máy khác — unhandled rejection mỗi 2s',
  )
}
check('W-N10.2 NoteEditor dùng isRowMissingOnServerError',
  editorSrc.includes('isRowMissingOnServerError'),
  'không phân biệt deleted-on-server để báo message đúng')
check('W-N10.3 KHÔNG clearNoteDraft trong khối catch nào',
  !/catch\s*\([^)]*\)\s*\{[\s\S]{0,400}?clearNoteDraft/.test(editorSrc),
  'draft — nơi duy nhất giữ keystroke khi save chết — bị xóa trong catch')

check('W-N12 scheduleDraftWrite ghi baselineUpdatedAt',
  /baselineUpdatedAt:/.test(editorSrc),
  'draft không mang baseline → shouldApplyDraft vẫn phụ thuộc đồng hồ chéo')

check('W-N13.1 webLock.ts export OFFSCREEN_CLIPBOARD_LOCK',
  webLockSrc.includes('OFFSCREEN_CLIPBOARD_LOCK'),
  'chưa có lock name cho luồng offscreen')
check('W-N13.2 background.ts bọc luồng offscreen trong withWebLock(OFFSCREEN_CLIPBOARD_LOCK',
  bgSrc.includes('withWebLock(OFFSCREEN_CLIPBOARD_LOCK'),
  '2 copy đồng thời: createDocument throw "Only a single offscreen document" hoặc close giết doc của lệnh kia')

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/N10-N12-N13-edit-safety.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix N10+N12+N13 đúng spec.')
