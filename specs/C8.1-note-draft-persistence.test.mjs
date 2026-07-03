/**
 * FAILING TEST — C8.1: draft-to-session-storage cho NoteEditor (không mất keystrokes khi popup kill).
 *
 * Chạy: node specs/C8.1-note-draft-persistence.test.mjs
 *
 * Thực thi CODE THẬT của src/services/noteDraft.service.ts (transpile) với mock
 * chrome.storage.session. Popup-kill không mô phỏng được bằng Node — end-to-end verify tay
 * theo checklist PHẦN C của spec.
 *
 * RED trên code hiện tại: T1/T2 (service chưa tồn tại), W1-W3 (wiring chưa có).
 * GREEN sau specs/C8.1-note-draft-persistence.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

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

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}

// ── mock chrome.storage.session ──────────────────────────────────────────────
const sessionStore = new Map()
globalThis.chrome = {
  storage: {
    session: {
      async get(key) {
        return { [key]: sessionStore.get(key) }
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) sessionStore.set(k, v)
      },
      async remove(key) {
        sessionStore.delete(key)
      },
    },
  },
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1+T2 — noteDraft.service.ts (thực thi code thật)')

const SERVICE_PATH = path.join(ROOT, 'src', 'services', 'noteDraft.service.ts')
const constantsReal = loadTsModule(path.join(ROOT, 'src', 'constants', 'storage.ts'), {})

check(
  'T1a noteDraft.service.ts tồn tại',
  fs.existsSync(SERVICE_PATH),
  'chưa có service — keystrokes trong cửa sổ debounce 2s vẫn mất khi popup bị kill',
)

if (fs.existsSync(SERVICE_PATH)) {
  const svc = loadTsModule(SERVICE_PATH, {
    '@/constants/storage': constantsReal,
  })
  const { saveNoteDraft, readNoteDraft, clearNoteDraft, shouldApplyDraft } = svc

  const hasApi =
    typeof saveNoteDraft === 'function'
    && typeof readNoteDraft === 'function'
    && typeof clearNoteDraft === 'function'
    && typeof shouldApplyDraft === 'function'
  check('T1b export đủ save/read/clear/shouldApplyDraft', hasApi, 'thiếu API theo contract spec')

  if (hasApi) {
    const draft = {
      bodyId: 'b1',
      noteId: 'n1',
      content: '<p>typed just before popup died</p>',
      at: '2026-07-03T10:00:05.000Z',
    }
    await saveNoteDraft(draft)
    const roundtrip = await readNoteDraft()
    check(
      'T1c save → read roundtrip nguyên vẹn',
      JSON.stringify(roundtrip) === JSON.stringify(draft),
      `read = ${JSON.stringify(roundtrip)}`,
    )

    sessionStore.set(constantsReal.BBQ_NOTE_DRAFT_SESSION_KEY ?? 'bbqone_note_editor_draft', {
      bogus: true,
    })
    check(
      'T1d shape rác → read trả null (không crash restore path)',
      (await readNoteDraft()) === null,
      'draft không hợp lệ phải bị bỏ qua',
    )

    await saveNoteDraft(draft)
    await clearNoteDraft()
    check('T1e clear xóa draft', (await readNoteDraft()) === null, 'clear không xóa')

    const body = { id: 'b1', updated_at: '2026-07-03T10:00:00.000Z' }
    check(
      'T2 shouldApplyDraft đúng 4 nhánh (mới hơn / cũ hơn-bằng / body null / khác id)',
      shouldApplyDraft(draft, body) === true
        && shouldApplyDraft({ ...draft, at: '2026-07-03T09:59:59.000Z' }, body) === false
        && shouldApplyDraft({ ...draft, at: body.updated_at }, body) === false
        && shouldApplyDraft(draft, null) === false
        && shouldApplyDraft(draft, { id: 'OTHER', updated_at: '2026-07-01T00:00:00.000Z' }) === false,
      'ngữ nghĩa shouldApplyDraft lệch spec — nguy cơ áp draft cũ đè bản mới (tái tạo C1)',
    )
  }
} else {
  console.log('  (bỏ qua T1b-T2 — chưa có service)')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW1-W3 — static wiring')

check(
  'W1 constants/storage.ts có BBQ_NOTE_DRAFT_SESSION_KEY',
  typeof constantsReal.BBQ_NOTE_DRAFT_SESSION_KEY === 'string',
  'chưa có session key cho draft',
)

const editorSrc = fs.readFileSync(
  path.join(ROOT, 'src', 'components', 'notes', 'NoteEditor.vue'),
  'utf8',
)
check(
  'W2 NoteEditor ghi draft (saveNoteDraft) + xóa sau save (clearNoteDraft) + guard secure (is_secure)',
  editorSrc.includes('saveNoteDraft(')
    && editorSrc.includes('clearNoteDraft(')
    && editorSrc.includes('is_secure'),
  'onUpdate chưa ghi draft / save xong chưa dọn / thiếu guard secure-folder (plaintext lọt ra session storage)',
)

const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const iRestore = appSrc.indexOf('maybeRestoreNoteDraft()')
const iRefresh = appSrc.indexOf('refreshStoresFromNetwork().then')
check(
  'W3 pages/App.vue khôi phục draft trong onMounted TRƯỚC pull',
  iRestore !== -1 && iRefresh !== -1 && iRestore < iRefresh && appSrc.includes('shouldApplyDraft'),
  `iRestore=${iRestore}, iRefresh=${iRefresh} — draft không được áp lại (hoặc áp sau pull, thua race)`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C8.1-note-draft-persistence.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — C8.1 draft persistence đúng spec.')
