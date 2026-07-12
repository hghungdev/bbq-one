/**
 * FAILING TEST — N3: đổi tài khoản cùng profile → data account A bị push lên cloud account B.
 *
 * Chạy:   node specs/N3-account-switch-guard.test.mjs
 *
 * Thực thi CODE THẬT: src/services/localFirst/dataOwner.service.ts (mới — RED vì chưa tồn tại),
 * localStore.service.ts, types/localFirst.ts, constants/storage.ts, syncEngine.service.ts
 * (mock supabase = recorder ghi lại mọi upsert, mock authMode).
 *
 * RED trên code hiện tại: T1–T5 + W1/W2 fail. GREEN sau khi áp specs/N3-account-switch-guard.spec.md.
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

// ── mock chrome.storage.local (in-memory, hỗ trợ get(string|array|null), remove(string|array)) ──
const store = new Map()
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        if (keys === null || keys === undefined) return Object.fromEntries(store)
        const list = Array.isArray(keys) ? keys : [keys]
        const out = {}
        for (const k of list) if (store.has(k)) out[k] = store.get(k)
        return out
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) store.set(k, v)
      },
      async remove(keys) {
        const list = Array.isArray(keys) ? keys : [keys]
        for (const k of list) store.delete(k)
      },
    },
  },
}

// ── modules thật ─────────────────────────────────────────────────────────────
const constants = loadTsModule(path.join(ROOT, 'src', 'constants', 'storage.ts'))
const typesLocalFirst = loadTsModule(path.join(ROOT, 'src', 'types', 'localFirst.ts'))
const localStoreMod = loadTsModule(
  path.join(ROOT, 'src', 'services', 'localFirst', 'localStore.service.ts'),
  { '@/types/localFirst': typesLocalFirst },
)
const KEYS = typesLocalFirst.LOCAL_STORAGE_KEYS
// giá trị pin từ source (constants/calendar.ts:1, syncConflict.ts:61)
const CALENDAR_EVENTS_CACHE_KEY = 'calendar_events_cache'
const BBQ_CONFLICT_BACKUPS_KEY = 'bbqone_conflict_backups'

// ── supabase recorder cho syncEngine thật ────────────────────────────────────
const upserts = []
const supabaseRecorder = {
  from(table) {
    return {
      upsert(row) {
        upserts.push({ table, row })
        return Promise.resolve({ error: null })
      },
    }
  },
  auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
}
let currentUserId = 'user-b'
const conflictDetector = loadTsModule(
  path.join(ROOT, 'src', 'services', 'localFirst', 'conflictDetector.ts'),
  { './localStore.service': localStoreMod, '@/types/localFirst': typesLocalFirst },
)

console.log('Load dataOwner.service.ts (CODE THẬT)')
let dataOwner = null
try {
  dataOwner = loadTsModule(
    path.join(ROOT, 'src', 'services', 'localFirst', 'dataOwner.service.ts'),
    {
      '@/constants/storage': constants,
      '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY },
      '@/utils/syncConflict': { BBQ_CONFLICT_BACKUPS_KEY },
      './localStore.service': localStoreMod,
      '@/types/localFirst': typesLocalFirst,
    },
  )
} catch (e) {
  check('T0 dataOwner.service.ts tồn tại và load được', false, e.message)
}

const syncEngine = loadTsModule(
  path.join(ROOT, 'src', 'services', 'localFirst', 'syncEngine.service.ts'),
  {
    '@/services/supabase': { supabase: supabaseRecorder },
    './authMode': { getCurrentUserId: async () => currentUserId },
    './localStore.service': localStoreMod,
    '@/types/localFirst': typesLocalFirst,
    './conflictDetector': conflictDetector,
    './dataOwner.service': dataOwner ?? { isPushAllowedFor: async () => true },
  },
)

// ── seed helpers ─────────────────────────────────────────────────────────────
const NOTE_A = {
  id: 'note-cua-A-0001',
  title: 'Nhật ký riêng của A',
  folder_id: null,
  tags: [],
  updated_at: '2026-07-10T00:00:00Z',
  created_at: '2026-07-10T00:00:00Z',
  __synced: false,
}
const NOTE_A_SYNCED = { ...NOTE_A, id: 'note-cua-A-synced', __synced: true }

function seedAccountAData() {
  store.set(KEYS.notes, [NOTE_A, NOTE_A_SYNCED])
  store.set(constants.NOTES_CACHE_KEY, [{ id: NOTE_A.id, title: NOTE_A.title }])
  store.set(constants.NOTE_BODIES_CACHE_KEY, [{ id: 'body-1', note_id: NOTE_A.id }])
  store.set(constants.FOLDERS_CACHE_KEY, [{ id: 'folder-1' }])
  store.set(CALENDAR_EVENTS_CACHE_KEY, [{ id: 'ev-1' }])
  store.set(constants.BOOKMARKS_CACHE_KEY, [{ id: 'bk-1' }])
  store.set(constants.BBQ_PENDING_DELETE_COMMITS_KEY, [{ id: 'note:xxxx', expiresAt: 0 }])
  store.set(BBQ_CONFLICT_BACKUPS_KEY, [{ kind: 'note', row: { id: 'n' }, at: 'x' }])
  store.set('ui_lang', 'vi') // per-device — KHÔNG được purge
}

// ═════════════════════════════════════════════════════════════════════════════
// TIMELINE MINH HỌA (không assert) — sau N3.1 guard chặn push khi owner lệch
// ═════════════════════════════════════════════════════════════════════════════
console.log('TIMELINE — pushLocalToCloud với owner=A, session=B (sau N3.1 guard):')
{
  store.clear()
  upserts.length = 0
  seedAccountAData()
  store.set(constants.BBQ_DATA_OWNER_USER_ID_KEY, 'user-a')
  const t0 = Date.now()
  console.log(`  t=${Date.now() - t0}ms  owner=user-a, local có note chưa-sync của A`)
  console.log(`  t=${Date.now() - t0}ms  session=user-b (B login, chưa kịp ensureLocalDataOwnership)`)
  const result = await syncEngine.pushLocalToCloud('use-local')
  const leaked = upserts.filter((u) => u.row.id === NOTE_A.id)
  if (leaked.length === 0) {
    console.log(`  t=${Date.now() - t0}ms  pushLocalToCloud SKIPPED (skippedForeignOwner=${result.skippedForeignOwner}) — N3.1 chặn leak`)
  }
  for (const u of leaked) {
    console.log(
      `  t=${Date.now() - t0}ms  SERVER UPSERT ${u.table} id=${u.row.id} user_id=${u.row.user_id}` +
        `  ← LEAK (guard chưa có)`,
    )
  }
}

// ═════════════════════════════════════════════════════════════════════════════
if (dataOwner) {
  const { ensureLocalDataOwnership } = dataOwner
  const OWNER_KEY = constants.BBQ_DATA_OWNER_USER_ID_KEY
  const STASH_KEY = constants.BBQ_FOREIGN_STASH_KEY

  check('T0 constants export 2 key mới', typeof OWNER_KEY === 'string' && typeof STASH_KEY === 'string',
    `BBQ_DATA_OWNER_USER_ID_KEY=${OWNER_KEY}, BBQ_FOREIGN_STASH_KEY=${STASH_KEY}`)

  // T1 — first-login (anonymous onboarding giữ nguyên)
  console.log('\nT1 — first-login: owner chưa có → nhận owner, local GIỮ NGUYÊN')
  store.clear()
  store.set(KEYS.notes, [{ ...NOTE_A, id: 'anon-note' }])
  const r1 = await ensureLocalDataOwnership('user-a')
  check('T1.1 status=first-login', r1?.status === 'first-login', `status=${r1?.status}`)
  check('T1.2 owner=user-a', store.get(OWNER_KEY) === 'user-a', `owner=${store.get(OWNER_KEY)}`)
  check('T1.3 local giữ nguyên (anonymous data vẫn push được lên account đầu tiên)',
    (store.get(KEYS.notes) ?? []).length === 1, `notes=${JSON.stringify(store.get(KEYS.notes))}`)

  // T2 — same-owner
  console.log('\nT2 — same-owner: A login lại → không đụng gì')
  const r2 = await ensureLocalDataOwnership('user-a')
  check('T2.1 status=same-owner', r2?.status === 'same-owner', `status=${r2?.status}`)
  check('T2.2 local giữ nguyên', (store.get(KEYS.notes) ?? []).length === 1, '')

  // T3 — foreign: B login trên data của A
  console.log('\nT3 — foreign: B login → stash phần chưa-sync của A + purge account-scoped keys')
  store.clear()
  store.set(OWNER_KEY, 'user-a')
  seedAccountAData()
  const r3 = await ensureLocalDataOwnership('user-b')
  check('T3.1 status=foreign-stashed', r3?.status === 'foreign-stashed', `status=${r3?.status}`)
  check('T3.2 restoredOwnStash=false (B chưa từng bị stash)', r3?.restoredOwnStash === false,
    `restoredOwnStash=${r3?.restoredOwnStash}`)
  check('T3.3 bbqone_local_notes rỗng/không còn', !(store.get(KEYS.notes) ?? []).length,
    `notes=${JSON.stringify(store.get(KEYS.notes))}`)
  const purged = [
    constants.NOTES_CACHE_KEY, constants.NOTE_BODIES_CACHE_KEY, constants.FOLDERS_CACHE_KEY,
    CALENDAR_EVENTS_CACHE_KEY, constants.BOOKMARKS_CACHE_KEY,
    constants.BBQ_PENDING_DELETE_COMMITS_KEY, BBQ_CONFLICT_BACKUPS_KEY,
  ]
  check('T3.4 7 key account-scoped bị purge', purged.every((k) => !store.has(k)),
    `còn lại: ${purged.filter((k) => store.has(k)).join(', ')}`)
  const stash = store.get(STASH_KEY)?.['user-a']
  check('T3.5 stash[user-a] chứa note chưa-sync của A', !!stash && stash.notes?.some((n) => n.id === NOTE_A.id),
    `stash=${JSON.stringify(stash)?.slice(0, 120)}`)
  check('T3.6 stash KHÔNG chứa entry __synced=true', !!stash && !stash.notes?.some((n) => n.id === NOTE_A_SYNCED.id),
    'bản mirror server của A bị stash thừa')
  check('T3.7 owner=user-b', store.get(OWNER_KEY) === 'user-b', `owner=${store.get(OWNER_KEY)}`)
  check('T3.8 key per-device (ui_lang) KHÔNG bị purge', store.get('ui_lang') === 'vi',
    `ui_lang=${store.get('ui_lang')}`)

  // T5 — integration: push THẬT sau purge → 0 upsert mang note của A
  console.log('\nT5 — sau guard, pushLocalToCloud THẬT của B không được đụng note của A')
  upserts.length = 0
  currentUserId = 'user-b'
  await syncEngine.pushLocalToCloud('use-local')
  check('T5 0 upsert chứa note id của A', !upserts.some((u) => u.row.id === NOTE_A.id),
    `leaked=${JSON.stringify(upserts.filter((u) => u.row.id === NOTE_A.id))}`)

  // T4 — A quay lại: restore stash
  console.log('\nT4 — A login lại: stash được trả về bbqone_local_* để push flow tự lành')
  const r4 = await ensureLocalDataOwnership('user-a')
  check('T4.1 restoredOwnStash=true', r4?.restoredOwnStash === true, `r=${JSON.stringify(r4)}`)
  check('T4.2 note của A nằm lại trong bbqone_local_notes',
    (store.get(KEYS.notes) ?? []).some((n) => n.id === NOTE_A.id),
    `notes=${JSON.stringify(store.get(KEYS.notes))?.slice(0, 120)}`)
  check('T4.3 stash[user-a] đã xóa', !(store.get(STASH_KEY) ?? {})['user-a'], '')
  check('T4.4 owner=user-a', store.get(OWNER_KEY) === 'user-a', `owner=${store.get(OWNER_KEY)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW1 — src/App.vue: runSyncFlow gate ownership TRƯỚC push')
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'App.vue'), 'utf8')
const fnStart = appSrc.indexOf('async function runSyncFlow')
const fnBody = fnStart === -1 ? '' : appSrc.slice(fnStart, appSrc.indexOf('\n}', fnStart))
const idxEnsure = fnBody.indexOf('ensureLocalDataOwnership(')
const idxOverflow = fnBody.indexOf('detectCalendarDayOverflow')
check(
  'W1.1 runSyncFlow gọi ensureLocalDataOwnership TRƯỚC detectCalendarDayOverflow',
  idxEnsure !== -1 && idxOverflow !== -1 && idxEnsure < idxOverflow,
  `idxEnsure=${idxEnsure}, idxOverflow=${idxOverflow} — không có guard, push chạy thẳng`,
)
check(
  "W1.2 runSyncFlow có nhánh 'foreign-stashed' (skip push)",
  fnBody.includes('foreign-stashed'),
  'không có nhánh skip — data account cũ vẫn bị push',
)

console.log('\nW2 — constants/storage.ts export 2 key mới')
const constSrc = fs.readFileSync(path.join(ROOT, 'src', 'constants', 'storage.ts'), 'utf8')
check(
  'W2 BBQ_DATA_OWNER_USER_ID_KEY + BBQ_FOREIGN_STASH_KEY',
  constSrc.includes('BBQ_DATA_OWNER_USER_ID_KEY') && constSrc.includes('BBQ_FOREIGN_STASH_KEY'),
  'thiếu key constants',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/N3-account-switch-guard.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix N3 đúng spec.')
