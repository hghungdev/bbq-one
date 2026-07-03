/**
 * FAILING TEST — C1: pull-overwrite đè mất offline edits (notes + calendar events).
 *
 * Chạy:   node specs/C1-pull-overwrite.test.mjs
 * Smoke:  node specs/C1-pull-overwrite.test.mjs --module-only <path-to-alt-sync.service.ts>
 *         (chỉ chạy Part 1 — behavior của merge-guard — trên một bản implement khác)
 *
 * Fallback declared (xem specs/C1-pull-overwrite.spec.md PHẦN B): loadAll() nằm trong Pinia
 * store import Vue/chrome → không thực thi được bằng Node thuần. Test gồm:
 *   Part 1 — behavior test THỰC THI CODE THẬT của src/services/sync.service.ts (transpile)
 *   Part 2 — static wiring check trên notes.ts / calendarEvents.ts / pages/App.vue
 *   Part 3 — timeline deterministic encode hằng số THẬT từ autoSync.service.ts
 *            (pull t≈200ms vs push t = ONLINE_STABLE_MS + ONLINE_DEBOUNCE_MS = 6000ms)
 *
 * RED trên code hiện tại: Part 1 (thiếu export) + Part 2 (thiếu call site) fail.
 * GREEN sau khi áp specs/C1-pull-overwrite.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

const MODULE_ONLY = process.argv[2] === '--module-only'
const SYNC_SERVICE_PATH = MODULE_ONLY
  ? process.argv[3]
  : path.join(ROOT, 'src', 'services', 'sync.service.ts')

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

// ═════════════════════════════════════════════════════════════════════════════
// Part 1 — behavior: mergeFreshWithDirtyLocal + isRowDirty (thực thi code thật)
// ═════════════════════════════════════════════════════════════════════════════
console.log('PART 1 — merge-guard behavior (thực thi sync.service.ts thật, mock imports)')

const stub = {}
const syncConflictReal = loadTsModule(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), {})
const sync = loadTsModule(SYNC_SERVICE_PATH, {
  '@/constants/storage': {
    NOTES_CACHE_KEY: 'notes_cache',
    NOTE_BODIES_CACHE_KEY: 'note_bodies_cache',
    FOLDERS_CACHE_KEY: 'folders_cache',
  },
  '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
  '@/utils/secureCrypto': { encryptField: async (v) => v, isEncryptedEnvelope: () => false },
  '@/utils/syncConflict': syncConflictReal,
  './calendarEvents.service': { calendarEventsService: stub },
  './noteBodies.service': { noteBodiesService: stub },
  './notes.service': { notesService: stub },
  './localFirst/authMode': { isAuthenticated: async () => false },
})

const hasMerge = typeof sync.mergeFreshWithDirtyLocal === 'function'
const hasIsRowDirty = typeof sync.isRowDirty === 'function'
check(
  '1.0 sync.service.ts export mergeFreshWithDirtyLocal + isRowDirty',
  hasMerge && hasIsRowDirty,
  `mergeFreshWithDirtyLocal=${typeof sync.mergeFreshWithDirtyLocal}, isRowDirty=${typeof sync.isRowDirty} — chưa có merge-guard, loadAll() đang đè state vô điều kiện`,
)

// Data mẫu: n1 sửa OFFLINE (dirty), n2 sạch, n3 chỉ có local-dirty (server đã mất / fresh rỗng), n4 chỉ có trên server
const localDirtyN1 = {
  id: 'n1', title: 'EDITED OFFLINE 10:00',
  updated_at: '2026-07-03T10:00:00.000Z', synced_at: '2026-07-01T00:00:00.000Z',
}
const freshStaleN1 = {
  id: 'n1', title: 'OLD SERVER COPY',
  updated_at: '2026-07-01T00:00:00.000Z', synced_at: '2026-07-01T00:00:00.000Z',
}
const localCleanN2 = {
  id: 'n2', title: 'local clean (old)',
  updated_at: '2026-07-01T00:00:00.000Z', synced_at: '2026-07-01T00:00:00.000Z',
}
const freshNewerN2 = {
  id: 'n2', title: 'server newer (edited on another device)',
  updated_at: '2026-07-02T00:00:00.000Z', synced_at: '2026-07-02T00:00:00.000Z',
}
const localDirtyN3 = {
  id: 'n3', title: 'created/edited offline, absent from fresh',
  updated_at: '2026-07-03T09:00:00.000Z', synced_at: null,
}
const freshOnlyN4 = {
  id: 'n4', title: 'server only',
  updated_at: '2026-07-02T12:00:00.000Z', synced_at: '2026-07-02T12:00:00.000Z',
}

if (hasMerge && hasIsRowDirty) {
  const { mergeFreshWithDirtyLocal, isRowDirty } = sync

  const merged = mergeFreshWithDirtyLocal(
    [freshStaleN1, freshNewerN2, freshOnlyN4],
    [localDirtyN1, localCleanN2, localDirtyN3],
    isRowDirty,
  )
  const byId = new Map(merged.map((r) => [r.id, r]))

  check(
    '1.1 row DIRTY local thắng row fresh cùng id (offline edit không bị đè)',
    byId.get('n1')?.title === 'EDITED OFFLINE 10:00',
    `n1 = ${JSON.stringify(byId.get('n1'))}`,
  )
  check(
    '1.2 row SẠCH local thua fresh (pull bình thường giữ nguyên hành vi)',
    byId.get('n2')?.title === 'server newer (edited on another device)',
    `n2 = ${JSON.stringify(byId.get('n2'))}`,
  )
  check(
    '1.3 row DIRTY vắng mặt trong fresh vẫn được GIỮ (scenario C: fresh rỗng khi anonymous)',
    byId.get('n3')?.title === 'created/edited offline, absent from fresh',
    `n3 mất khỏi merged = ${JSON.stringify(merged.map((r) => r.id))}`,
  )
  check('1.4 row fresh-only được thêm vào', byId.get('n4')?.title === 'server only', `n4 = ${JSON.stringify(byId.get('n4'))}`)

  // scenario C nguyên bản: fresh = [] (anonymous local-mode sau restart browser)
  const scenarioC = mergeFreshWithDirtyLocal([], [localDirtyN1, localCleanN2], isRowDirty)
  check(
    '1.5 fresh=[] không xóa dirty rows (chặn ghi cache rỗng đè offline edits)',
    scenarioC.length === 1 && scenarioC[0].id === 'n1',
    `scenarioC = ${JSON.stringify(scenarioC.map((r) => r.id))}`,
  )

  const noDirty = mergeFreshWithDirtyLocal([freshNewerN2], [localCleanN2], isRowDirty)
  check(
    '1.6 không có dirty → trả nguyên fresh; isRowDirty đúng 3 nhánh',
    noDirty.length === 1 &&
      noDirty[0] === freshNewerN2 &&
      isRowDirty({ updated_at: '2026-07-03T00:00:00Z', synced_at: null }) === true &&
      isRowDirty({ updated_at: '2026-07-03T00:00:00Z', synced_at: '2026-07-01T00:00:00Z' }) === true &&
      isRowDirty({ updated_at: '2026-07-01T00:00:00Z', synced_at: '2026-07-01T00:00:00Z' }) === false,
    'ngữ nghĩa dirty/merge lệch spec',
  )
} else {
  console.log('  (bỏ qua 1.1–1.6 — chưa có hàm để test)')
}

if (MODULE_ONLY) {
  console.log('\n──────────────────────────────────────────────')
  if (failures.length > 0) {
    console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log('✅ PASS (module-only) — merge-guard đúng ngữ nghĩa spec.')
  process.exit(0)
}

// ═════════════════════════════════════════════════════════════════════════════
// Part 2 — static wiring: các call site theo đúng tên hàm spec quy định
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nPART 2 — wiring (static check trên source thật)')

const notesSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'notes.ts'), 'utf8')
const calSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'calendarEvents.ts'), 'utf8')
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')

const notesCalls = (notesSrc.match(/mergeFreshWithDirtyLocal\(/g) ?? []).length
check(
  '2.1 notes.ts loadAll merge cho CẢ notes lẫn bodies (≥2 call)',
  notesCalls >= 2,
  `tìm thấy ${notesCalls} call mergeFreshWithDirtyLocal( trong notes.ts — loadAll đang gán thẳng notes.value/bodies.value = fresh (notes.ts:133-134)`,
)
const calCalls = (calSrc.match(/mergeFreshWithDirtyLocal\(/g) ?? []).length
check(
  '2.2 calendarEvents.ts loadAll merge cho events (≥1 call)',
  calCalls >= 1,
  `tìm thấy ${calCalls} call — loadAll đang gán thẳng events.value = withNormalizedDates(fresh) (calendarEvents.ts:105)`,
)

const fnStart = appSrc.indexOf('async function refreshStoresFromNetwork')
const fnBody = fnStart === -1 ? '' : appSrc.slice(fnStart, appSrc.indexOf('}', fnStart) + 1)
const iPush = fnBody.indexOf('runBackgroundAutoSync(')
const iPull = fnBody.indexOf('Promise.all')
check(
  '2.3 pages/App.vue: refreshStoresFromNetwork PUSH (runBackgroundAutoSync) TRƯỚC pull (Promise.all)',
  fnStart !== -1 && iPush !== -1 && iPull !== -1 && iPush < iPull,
  `refreshStoresFromNetwork (pages/App.vue:86-89) hiện pull thẳng không push trước (iPush=${iPush}, iPull=${iPull})`,
)

// ═════════════════════════════════════════════════════════════════════════════
// Part 3 — timeline deterministic: pull LUÔN thắng push trên code hiện tại
// (hằng số đọc từ source thật — không bịa)
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nPART 3 — timeline (hằng số thật từ autoSync.service.ts)')

const autoSyncSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'autoSync.service.ts'), 'utf8')
const num = (re) => parseInt((autoSyncSrc.match(re) ?? [])[1]?.replace(/_/g, '') ?? 'NaN', 10)
const ONLINE_DEBOUNCE_MS = num(/ONLINE_DEBOUNCE_MS\s*=\s*([\d_]+)/) // autoSync.service.ts:13
const ONLINE_STABLE_MS = num(/ONLINE_STABLE_MS\s*=\s*([\d_]+)/) //   autoSync.service.ts:15
const PUSH_AT = ONLINE_STABLE_MS + ONLINE_DEBOUNCE_MS
const PULL_START = 0 // pages/App.vue:176-179 gọi refreshStoresFromNetwork ngay trong 'online' listener
const PULL_DONE = 200 // fetch Supabase điển hình; NETWORK_LOAD_MS timeout 12_000 (notes.ts:21)

console.log(`  ONLINE_STABLE_MS=${ONLINE_STABLE_MS}  ONLINE_DEBOUNCE_MS=${ONLINE_DEBOUNCE_MS}  → push tại t=${PUSH_AT}ms`)
console.log('  Scenario A trên code hiện tại (popup mở, offline edit "EDITED OFFLINE 10:00" đang dirty trong cache):')
console.log(`  t=${PULL_START}ms     'online' event → App.vue pull ngay (refreshStoresFromNetwork)`)
console.log(`  t≈${PULL_DONE}ms   pull xong → notes.value = fresh ("OLD SERVER COPY") → persistCache() đè cache dirty`)
console.log(`  t=${PUSH_AT}ms  autoSync push chạy → syncFromCache không còn row dirty nào → push 0 row`)
console.log('  → DATA LOST: "EDITED OFFLINE 10:00" (n1) bị revert về "OLD SERVER COPY", không thông báo.')

check(
  '3.1 tiền đề race đúng như source: pull hoàn tất trước push',
  Number.isFinite(PUSH_AT) && PULL_DONE < PUSH_AT,
  `không đọc được hằng số từ autoSync.service.ts (PUSH_AT=${PUSH_AT}) — source đã đổi, cập nhật spec/test`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C1-pull-overwrite.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — merge-guard + wiring push-trước-pull đầy đủ. Fix C1 đúng spec.')
