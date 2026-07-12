/**
 * C9 — Supabase optimistic lock client wiring.
 * Chạy: node specs/C9-supabase-optimistic-lock.test.mjs
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

// ── Part 1: pure helpers ─────────────────────────────────────────────────────
console.log('PART 1 — expectedServerUpdatedAt (syncConflict.ts thật)')

const syncConflict = loadTsModule(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), { '@/utils/webLock': loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'), {}) })
const { expectedServerUpdatedAt, isSyncConflictError, SyncConflictError, C9_OPTIMISTIC_RPC_ENABLED } =
  syncConflict

check(
  'C9.1 dirty row → baseline = synced_at',
  expectedServerUpdatedAt({
    updated_at: '2026-01-03T10:00:00Z',
    synced_at: '2026-01-01T08:00:00Z',
  }) === '2026-01-01T08:00:00Z',
  'dirty baseline sai',
)
check(
  'C9.2 clean row → baseline = updated_at',
  expectedServerUpdatedAt({
    updated_at: '2026-01-01T08:00:00Z',
    synced_at: '2026-01-01T08:00:00Z',
  }) === '2026-01-01T08:00:00Z',
  'clean baseline sai',
)
check(
  'C9.3 synced_at null → null (plain update, không RPC guard)',
  expectedServerUpdatedAt({
    updated_at: '2026-01-03T10:00:00Z',
    synced_at: null,
  }) === null,
  'should skip RPC',
)
check(
  'C9.4 isSyncConflictError nhận P0001 + BBQ_CONFLICT',
  isSyncConflictError({ code: 'P0001', message: 'BBQ_CONFLICT: note x' })
    && isSyncConflictError(new SyncConflictError()),
  'conflict detector',
)

check(
  'C9.4b C9_OPTIMISTIC_RPC_ENABLED (C9.1 đã bật lại)',
  C9_OPTIMISTIC_RPC_ENABLED === true,
  `C9_OPTIMISTIC_RPC_ENABLED=${C9_OPTIMISTIC_RPC_ENABLED} — phải true sau C9.1 baseline fix`,
)

// ── Part 2: notes.service RPC wiring ─────────────────────────────────────────
console.log('\nPART 2 — notesService.update: RPC khi enabled, plain update khi hotfix tắt')

const rpcCalls = []
const notesMod = loadTsModule(path.join(ROOT, 'src', 'services', 'notes.service.ts'), {
  './supabase': {
    supabase: {
      rpc: async (name, args) => {
        rpcCalls.push({ name, args })
        return { data: { id: args.p_id, title: args.p_title, folder_id: args.p_folder_id, tags: args.p_tags, synced_at: args.p_synced_at, updated_at: '2026-01-04T00:00:00Z' }, error: null }
      },
      from: () => ({
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) }),
      }),
    },
  },
  './noteBodies.service': { noteBodiesService: {} },
  '@/services/localFirst/authMode': { isAuthenticated: async () => true },
  '@/services/localFirst/localNotes.service': { localNotesService: {} },
  '@/utils/syncConflict': syncConflict,
  '@/utils/supabaseFetchAll': loadTsModule(path.join(ROOT, 'src', 'utils', 'supabaseFetchAll.ts'), {}),
})

const dirtyRow = {
  id: 'n1',
  title: 'local edit',
  folder_id: null,
  tags: [],
  updated_at: '2026-01-03T10:00:00Z',
  synced_at: '2026-01-01T08:00:00Z',
}

rpcCalls.length = 0
await notesMod.notesService.update(
  'n1',
  { title: 'local edit', synced_at: '2026-01-04T00:00:00Z' },
  { row: dirtyRow },
)

if (C9_OPTIMISTIC_RPC_ENABLED) {
  check(
    'C9.5 RPC bbq_update_note_if_current với p_expected_updated_at = synced_at',
    rpcCalls.length === 1
      && rpcCalls[0].name === 'bbq_update_note_if_current'
      && rpcCalls[0].args.p_expected_updated_at === '2026-01-01T08:00:00Z',
    `rpcCalls = ${JSON.stringify(rpcCalls)}`,
  )
} else {
  check(
    'C9.5 hotfix: RPC tắt → plain .update() (sync hoạt động, không BBQ_CONFLICT giả)',
    rpcCalls.length === 0,
    `rpcCalls = ${JSON.stringify(rpcCalls)} — RPC vẫn bật sẽ conflict vĩnh viễn trên dirty row`,
  )
}

// ── Part 3: static wiring sync + services ────────────────────────────────────
console.log('\nPART 3 — static wiring')

const notesSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'notes.service.ts'), 'utf8')
const syncSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'sync.service.ts'), 'utf8')

check(
  'C9.6 notes.service.ts có bbq_update_note_if_current',
  notesSrc.includes("rpc('bbq_update_note_if_current'"),
  'thiếu RPC notes',
)
check(
  'C9.7 sync.service syncDirtyNotesFromList truyền { row: n } / { row: b }',
  syncSrc.includes('{ row: b }') && syncSrc.includes('{ row: n }') && syncSrc.includes('{ row: ev }'),
  'sync push chưa truyền row baseline',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('✅ PASS — C9 client wiring đúng spec.')
