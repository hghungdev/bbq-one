/**
 * FAILING TEST — N3.1: ownership phải gate MỌI push path, không chỉ runSyncFlow.
 *
 * Chạy:   node specs/N3.1-ownership-hardening.test.mjs
 *
 * RED trên code hiện tại (sau N3):
 *   - T1 fail: isPushAllowedFor chưa export.
 *   - T2 fail: pushLocalToCloud (đường alarm 5'/network-restore) vẫn upsert note của A dưới user B.
 *   - T3 fail: syncFromCache vẫn push dirty cache của A dưới session B.
 *   - W1–W5 fail: chưa wire.
 * GREEN sau khi áp specs/N3.1-ownership-hardening.spec.md (kèm mục "Cập nhật HARNESS cũ").
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

// ── mock chrome.storage.local ────────────────────────────────────────────────
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

// ── modules thật dùng chung ──────────────────────────────────────────────────
const constants = loadTsModule(path.join(ROOT, 'src', 'constants', 'storage.ts'))
const typesLocalFirst = loadTsModule(path.join(ROOT, 'src', 'types', 'localFirst.ts'))
const KEYS = typesLocalFirst.LOCAL_STORAGE_KEYS
const localStoreMod = loadTsModule(
  path.join(ROOT, 'src', 'services', 'localFirst', 'localStore.service.ts'),
  { '@/types/localFirst': typesLocalFirst },
)
const webLockReal = loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'), {})
const syncConflictReal = loadTsModule(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), {
  '@/utils/webLock': webLockReal,
})
const dataOwner = loadTsModule(
  path.join(ROOT, 'src', 'services', 'localFirst', 'dataOwner.service.ts'),
  {
    '@/constants/storage': constants,
    '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
    '@/utils/syncConflict': syncConflictReal,
    './localStore.service': localStoreMod,
    '@/types/localFirst': typesLocalFirst,
  },
)
const OWNER_KEY = constants.BBQ_DATA_OWNER_USER_ID_KEY

const NOTE_A = {
  id: 'note-cua-A-0001',
  title: 'Nhật ký riêng của A',
  folder_id: null,
  tags: [],
  updated_at: '2026-07-10T00:00:00Z',
  created_at: '2026-07-10T00:00:00Z',
  __synced: false,
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — isPushAllowedFor (CODE THẬT dataOwner.service.ts)')
if (typeof dataOwner.isPushAllowedFor !== 'function') {
  check('T1.0 export isPushAllowedFor', false,
    'chưa tồn tại — không có chốt chặn tại-thời-điểm-push cho alarm/manual/network-restore')
} else {
  const f = dataOwner.isPushAllowedFor
  store.clear()
  check('T1.1 owner null (anonymous onboarding) → true', (await f('user-a')) === true, '')
  store.set(OWNER_KEY, 'user-a')
  check('T1.2 owner khớp → true', (await f('user-a')) === true, '')
  check('T1.3 owner lệch → false', (await f('user-b')) === false,
    'data của A vẫn được phép push dưới B')
  check('T1.4 uid null → false', (await f(null)) === false, '')
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — pushLocalToCloud (CODE THẬT syncEngine): đường alarm 5\' — owner lệch phải SKIP')
{
  store.clear()
  store.set(OWNER_KEY, 'user-a') // ensure của SIGNED_IN chưa kịp chạy / popup đóng sớm
  store.set(KEYS.notes, [NOTE_A])
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
  const conflictDetector = loadTsModule(
    path.join(ROOT, 'src', 'services', 'localFirst', 'conflictDetector.ts'),
    { './localStore.service': localStoreMod, '@/types/localFirst': typesLocalFirst },
  )
  const syncEngine = loadTsModule(
    path.join(ROOT, 'src', 'services', 'localFirst', 'syncEngine.service.ts'),
    {
      '@/services/supabase': { supabase: supabaseRecorder },
      './authMode': { getCurrentUserId: async () => 'user-b' },
      './localStore.service': localStoreMod,
      '@/types/localFirst': typesLocalFirst,
      './conflictDetector': conflictDetector,
      './dataOwner.service': dataOwner, // sau fix syncEngine sẽ import — cung cấp bản thật
    },
  )
  const t0 = Date.now()
  console.log(`  t=${Date.now() - t0}ms  SW alarm 'bbqone-autosync-retry' nổ → runBackgroundAutoSync → pushLocalToCloud`)
  const result = await syncEngine.pushLocalToCloud('use-local')
  const leaked = upserts.filter((u) => u.row.id === NOTE_A.id)
  for (const u of leaked) {
    console.log(`  t=${Date.now() - t0}ms  SERVER UPSERT ${u.table} id=${u.row.id} user_id=${u.row.user_id} ← LEAK`)
  }
  check('T2.1 KHÔNG upsert note của A dưới user_id B', leaked.length === 0,
    `${leaked.length} upsert leak — runSyncFlow gate vô nghĩa khi alarm/network-restore đi thẳng vào đây`)
  check('T2.2 result.skippedForeignOwner === true', result?.skippedForeignOwner === true,
    `result=${JSON.stringify(result)?.slice(0, 120)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — syncFromCache (CODE THẬT sync.service): dirty cache của A không được push dưới session B')
{
  store.clear()
  store.set(OWNER_KEY, 'user-a')
  store.set(constants.NOTES_CACHE_KEY, [
    {
      id: 'note-dirty-A',
      title: 'sửa offline của A',
      folder_id: null,
      tags: [],
      updated_at: '2026-07-13T00:00:02Z',
      synced_at: '2026-07-13T00:00:01Z', // dirty
    },
  ])
  let updateCalls = 0
  const emptyList = async () => []
  const syncSvc = loadTsModule(path.join(ROOT, 'src', 'services', 'sync.service.ts'), {
    '@/constants/storage': constants,
    '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
    '@/utils/secureCrypto': { encryptField: async (v) => v, isEncryptedEnvelope: () => false },
    './calendarEvents.service': { calendarEventsService: { getAll: emptyList } },
    './noteBodies.service': { noteBodiesService: { getAll: emptyList } },
    './notes.service': {
      notesService: {
        getAll: emptyList,
        update: async (id) => {
          updateCalls++
          return { id, updated_at: '2026-07-13T00:00:03Z', synced_at: '2026-07-13T00:00:03Z' }
        },
      },
    },
    './localFirst/authMode': {
      isAuthenticated: async () => true,
      getCurrentUserId: async () => 'user-b', // session giờ là B (chung storage.session)
    },
    './localFirst/dataOwner.service': dataOwner, // sau fix sync.service sẽ import
    '@/utils/syncConflict': syncConflictReal,
    '@/utils/supabaseFetchAll': loadTsModule(
      path.join(ROOT, 'src', 'utils', 'supabaseFetchAll.ts'), {}),
  })
  const count = await syncSvc.syncService.syncFromCache()
  check('T3.1 syncFromCache trả 0 (không push gì)', count === 0,
    `count=${count} — dirty rows của A bị push/stash dưới session B (rác trong ConflictBackupsDialog của B)`)
  check('T3.2 0 lần notesService.update', updateCalls === 0, `updateCalls=${updateCalls}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring checks')
const syncStoreSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'sync.ts'), 'utf8')
const rmsStart = syncStoreSrc.indexOf('async function runManualSync')
const rmsBody = rmsStart === -1 ? '' : syncStoreSrc.slice(rmsStart, syncStoreSrc.indexOf('\n  }', rmsStart))
check('W1.1 runManualSync check isPushAllowedFor', rmsBody.includes('isPushAllowedFor('),
  'nút sync tay vẫn push data account cũ')
check('W1.2 runManualSync check pushLocalToCloud().errors', /\.errors/.test(rmsBody),
  'partial fail vẫn markSynced — badge "synced" giả trên nhánh lỗi')

const rootAppSrc = fs.readFileSync(path.join(ROOT, 'src', 'App.vue'), 'utf8')
check('W2.1 src/App.vue: storage.onChanged listener cho owner key',
  rootAppSrc.includes('chrome.storage.onChanged.addListener') &&
    rootAppSrc.includes('BBQ_DATA_OWNER_USER_ID_KEY'),
  'context cũ (dashboard-tab của A) không biết account đã đổi — Pinia A sẽ persist/push lại')
check('W2.2 src/App.vue: location.reload cho stale context + flag selfOwnerChange',
  rootAppSrc.includes('location.reload') && rootAppSrc.includes('selfOwnerChange'),
  'thiếu reload hoặc thiếu flag chống tự-reload context vừa login')

const pagesAppSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const supStart = pagesAppSrc.indexOf('async function suppressUnexpiredPendingDeletes')
const supBody = supStart === -1 ? '' : pagesAppSrc.slice(supStart, pagesAppSrc.indexOf('\n  }', supStart))
check('W3 suppressUnexpiredPendingDeletes persist cache sau khi lọc',
  supBody.includes('persistCache()'),
  'row sắp-xóa vẫn nằm trong cache trên đĩa — context mới hydrate sẽ hồi sinh nó')

const foldersSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'folders.ts'), 'utf8')
const fpStart = foldersSrc.indexOf('async function persistCache')
const fpBody = fpStart === -1 ? '' : foldersSrc.slice(fpStart, foldersSrc.indexOf('\n  }', fpStart))
check('W4 folders.ts persistCache dùng safeCacheWrite',
  fpBody.includes('safeCacheWrite(') && !fpBody.includes('chrome.storage.local.set'),
  'folders cache vẫn throw quota')

const typesSrc = fs.readFileSync(path.join(ROOT, 'src', 'types', 'localFirst.ts'), 'utf8')
check('W5 SyncResult có skippedForeignOwner', typesSrc.includes('skippedForeignOwner'),
  'caller không phân biệt được "push bị chặn vì foreign owner" với "không có gì để push"')

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/N3.1-ownership-hardening.spec.md (kèm mục "Cập nhật HARNESS cũ") để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix N3.1 đúng spec. (Chạy lại TOÀN BỘ specs/*.test.mjs xác nhận không vỡ.)')
