/**
 * FAILING TEST — N4+N5+N11: multi-context (popup + dashboard-tab + SW).
 *
 * Chạy:   node specs/N4-N5-N11-multi-context.test.mjs
 *
 * RED trên code hiện tại:
 *   - T-N11 fail: register giữa lúc flush đang chờ network bị writeQueue(remaining) nuốt.
 *   - T-N5 fail:  mergeSnapshotWithStored chưa tồn tại trong sync.service.ts.
 *   - T-N4 fail:  listUnexpiredPendingDeletes chưa tồn tại.
 *   - W-* fail:   call site chưa đổi 'respect-expiry' / chưa có alarm / chưa có lock.
 * GREEN sau khi áp specs/N4-N5-N11-multi-context.spec.md.
 * LƯU Ý: sau fix, chạy thêm `node specs/C2-undo-flush-race.test.mjs` — PHẢI vẫn xanh.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tick = () => sleep(1)

// ── mock chrome.storage.local ────────────────────────────────────────────────
const store = new Map()
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        await tick()
        if (keys === null || keys === undefined) return Object.fromEntries(store)
        const list = Array.isArray(keys) ? keys : [keys]
        const out = {}
        for (const k of list) if (store.has(k)) out[k] = store.get(k)
        return out
      },
      async set(obj) {
        await tick()
        for (const [k, v] of Object.entries(obj)) store.set(k, v)
      },
      async remove(keys) {
        await tick()
        const list = Array.isArray(keys) ? keys : [keys]
        for (const k of list) store.delete(k)
      },
    },
  },
  alarms: { create() {} },
}

// ── mock navigator.locks = MUTEX THẬT (Web Locks semantics tối giản) ─────────
const lockTails = new Map()
// Node ≥21 có sẵn global navigator (getter-only) → phải defineProperty để override
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
  locks: {
    async request(name, fn) {
      const prev = lockTails.get(name) ?? Promise.resolve()
      let release
      const mine = new Promise((r) => (release = r))
      lockTails.set(name, prev.then(() => mine))
      await prev
      try {
        return await fn()
      } finally {
        release()
      }
    },
  },
  },
})

// ── load code thật ───────────────────────────────────────────────────────────
const constants = loadTsModule(path.join(ROOT, 'src', 'constants', 'storage.ts'))
const QUEUE_KEY = constants.BBQ_PENDING_DELETE_COMMITS_KEY

let webLockMod = null
try {
  webLockMod = loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'))
} catch {
  /* chưa có (code hiện tại không import) */
}

let t0 = Date.now()
const elapsed = () => Date.now() - t0
const timeline = []
const log = (m) => timeline.push(`t=${elapsed()}ms  ${m}`)
let deleted = []
const SLOW_DELETE_MS = 60
const slowDelete = (kind) => async (id) => {
  log(`SERVER DELETE ${kind} id=${id} — bắt đầu (network ${SLOW_DELETE_MS}ms)`)
  await sleep(SLOW_DELETE_MS)
  deleted.push({ kind, id })
  log(`SERVER DELETE ${kind} id=${id} — xong`)
}

const pdcMocks = {
  '@/constants/storage': constants,
  '@/services/bookmarks.service': { bookmarksService: { deleteBackup: slowDelete('bookmark-backup') } },
  '@/services/calendarEvents.service': { calendarEventsService: { delete: slowDelete('calendar') } },
  '@/services/notes.service': { notesService: { delete: slowDelete('note') } },
}
if (webLockMod) pdcMocks['@/utils/webLock'] = webLockMod
const pdc = loadTsModule(
  path.join(ROOT, 'src', 'services', 'pendingDeleteCommit.service.ts'),
  pdcMocks,
)

function queueIds() {
  const raw = store.get(QUEUE_KEY)
  if (!Array.isArray(raw)) return []
  return raw.map((e) => (typeof e === 'string' ? e : e?.id)).filter(Boolean)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('T-N11 — register giữa lúc flush đang chờ network KHÔNG được bị nuốt')
{
  store.clear()
  deleted = []
  timeline.length = 0
  t0 = Date.now()
  // Orphan A (context chết, đã hết hạn) nằm sẵn trong queue
  store.set(QUEUE_KEY, [{ id: 'note:aaaa-orphan', expiresAt: 0 }])
  log('queue = [note:aaaa-orphan (hết hạn)] — popup mount bắt đầu flush')
  const flushP = pdc.flushOrphanedPendingDeleteCommits('force')
  await sleep(15)
  log("dashboard-tab: user xóa note bbbb → registerPendingDeleteCommit('note:bbbb', +5s)")
  await pdc.registerPendingDeleteCommit('note:bbbb', Date.now() + 5_000)
  await flushP
  log(`flush xong — queue = ${JSON.stringify(queueIds())}`)
  console.log(timeline.map((l) => `  ${l}`).join('\n'))

  check(
    'T-N11.1 entry note:bbbb SỐNG SÓT trong queue sau flush',
    queueIds().includes('note:bbbb'),
    `queue=${JSON.stringify(queueIds())} — writeQueue(remaining) của flush nuốt entry đăng ký giữa chừng: ` +
      'dashboard-tab bị kill trước 5s → không ai xóa bbbb trên server → note "đã xóa" HỒI SINH ở pull kế tiếp',
  )
  check(
    'T-N11.2 bbbb chưa bị server-delete (undo window còn mở)',
    !deleted.some((d) => d.id === 'bbbb'),
    'bbbb bị xóa sớm trong undo window',
  )
  check(
    'T-N11.3 orphan aaaa vẫn được dọn',
    deleted.some((d) => d.id === 'aaaa-orphan'),
    'flush mất tác dụng dọn orphan',
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT-N4 — listUnexpiredPendingDeletes (CODE THẬT)')
{
  store.clear()
  const now = Date.now()
  store.set(QUEUE_KEY, [
    { id: 'note:live-1111', expiresAt: now + 5_000 },
    { id: 'calendar:dead-2222', expiresAt: now - 5_000 },
    'note:legacy-3333', // legacy string = expiresAt 0 = đã hết hạn
  ])
  if (typeof pdc.listUnexpiredPendingDeletes !== 'function') {
    check('T-N4.0 export listUnexpiredPendingDeletes', false, 'chưa tồn tại — pull sẽ hồi sinh row đang chờ xóa')
  } else {
    const pending = await pdc.listUnexpiredPendingDeletes()
    check(
      'T-N4.1 chỉ trả entry CHƯA hết hạn, đã parse kind/entityId',
      pending.length === 1 && pending[0].kind === 'note' && pending[0].entityId === 'live-1111',
      `pending=${JSON.stringify(pending)}`,
    )
    check(
      'T-N4.2 export scheduleOrphanExpiryAlarm + PENDING_DELETE_FLUSH_ALARM',
      typeof pdc.scheduleOrphanExpiryAlarm === 'function' &&
        typeof pdc.PENDING_DELETE_FLUSH_ALARM === 'string',
      'thiếu cơ chế alarm dọn orphan sau expiry',
    )
  }
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT-N5 — mergeSnapshotWithStored (CODE THẬT sync.service.ts)')
{
  const syncSvc = loadTsModule(path.join(ROOT, 'src', 'services', 'sync.service.ts'), {
    '@/constants/storage': constants,
    '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
    '@/utils/secureCrypto': { encryptField: async (v) => v, isEncryptedEnvelope: () => false },
    './calendarEvents.service': { calendarEventsService: {} },
    './noteBodies.service': { noteBodiesService: {} },
    './notes.service': { notesService: {} },
    './localFirst/authMode': { isAuthenticated: async () => true, getCurrentUserId: async () => 'u1' },
    './localFirst/dataOwner.service': { isPushAllowedFor: async () => true },
    '@/utils/syncConflict': { isSyncConflictError: () => false, stashConflictBackup: async () => {} },
  })
  const { mergeSnapshotWithStored, isRowDirty } = syncSvc
  if (typeof mergeSnapshotWithStored !== 'function') {
    check('T-N5.0 export mergeSnapshotWithStored', false,
      'chưa tồn tại — persistCache vẫn ghi đè toàn mảng, edit của context khác bị mất')
  } else {
    const row = (id, updated, synced) => ({ id, updated_at: updated, synced_at: synced })
    const T1 = '2026-07-13T00:00:01Z'
    const T2 = '2026-07-13T00:00:02Z'
    const T3 = '2026-07-13T00:00:03Z'

    // 1. disk dirty + mới hơn → disk thắng
    let out = mergeSnapshotWithStored([row('x', T1, T1)], [row('x', T3, T1)], isRowDirty)
    check('T-N5.1 disk-dirty mới hơn thắng snapshot', out.find((r) => r.id === 'x')?.updated_at === T3,
      `out=${JSON.stringify(out)}`)

    // 2. disk dirty nhưng CŨ hơn → snapshot thắng
    out = mergeSnapshotWithStored([row('x', T3, T1)], [row('x', T2, T1)], isRowDirty)
    check('T-N5.2 disk-dirty cũ hơn thua snapshot', out.find((r) => r.id === 'x')?.updated_at === T3, '')

    // 3. disk sạch cùng id → snapshot thắng
    out = mergeSnapshotWithStored([row('x', T1, T1)], [row('x', T3, T3)], isRowDirty)
    check('T-N5.3 disk sạch thua snapshot', out.find((r) => r.id === 'x')?.updated_at === T1, '')

    // 4. disk dirty KHÔNG có trong snapshot → GIỮ (edit offline context khác)
    out = mergeSnapshotWithStored([row('a', T1, T1)], [row('b', T2, T1)], isRowDirty)
    check('T-N5.4 disk-dirty vắng trong snapshot được giữ', out.some((r) => r.id === 'b'),
      `out=${JSON.stringify(out)} — offline edit của dashboard-tab bị popup persist đè mất`)

    // 5. disk SẠCH không có trong snapshot → drop (mình vừa xóa row đó)
    out = mergeSnapshotWithStored([row('a', T1, T1)], [row('c', T2, T2)], isRowDirty)
    check('T-N5.5 disk sạch vắng trong snapshot bị drop', !out.some((r) => r.id === 'c'),
      'row đã xóa hồi sinh từ disk')

    // 6. stored rỗng → trả nguyên snapshot
    const snap = [row('a', T1, T1)]
    out = mergeSnapshotWithStored(snap, [], isRowDirty)
    check('T-N5.6 stored rỗng trả nguyên snapshot', out.length === 1 && out[0].id === 'a', '')
  }
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring checks')
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
const bgSrc = fs.readFileSync(path.join(ROOT, 'src', 'background.ts'), 'utf8')
const notesSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'notes.ts'), 'utf8')
const calSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'calendarEvents.ts'), 'utf8')
const syncSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'sync.service.ts'), 'utf8')
const pdcSrc = fs.readFileSync(
  path.join(ROOT, 'src', 'services', 'pendingDeleteCommit.service.ts'), 'utf8')
const scSrc = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), 'utf8')

const flushCalls = [...appSrc.matchAll(/flushOrphanedPendingDeleteCommits\(([^)]*)\)/g)]
check(
  "W-N4.1 pages/App.vue: MỌI call flush đều 'respect-expiry'",
  flushCalls.length > 0 && flushCalls.every((m) => m[1].includes('respect-expiry')),
  `calls=${JSON.stringify(flushCalls.map((m) => m[0]))} — mount còn force, giết undo window của dashboard-tab`,
)
check(
  'W-N4.2 refreshStoresFromNetwork gọi suppressUnexpiredPendingDeletes sau Promise.all',
  (() => {
    const i = appSrc.indexOf('async function refreshStoresFromNetwork')
    if (i === -1) return false
    const body = appSrc.slice(i, appSrc.indexOf('\n  }', i))
    const a = body.indexOf('Promise.all')
    const s = body.indexOf('suppressUnexpiredPendingDeletes')
    return a !== -1 && s !== -1 && s > a
  })(),
  'pull vẫn hồi sinh row đang chờ xóa của context khác',
)
const msgBlock = bgSrc.slice(
  bgSrc.indexOf('isFlushPendingDeletesMessage(msg)'),
  bgSrc.indexOf('sendResponse({ ok: true })'),
)
check(
  "W-N4.3 background message handler flush 'respect-expiry' + scheduleOrphanExpiryAlarm",
  msgBlock.includes("'respect-expiry'") && msgBlock.includes('scheduleOrphanExpiryAlarm'),
  `block=${msgBlock.replace(/\s+/g, ' ').slice(0, 120)}`,
)
check(
  'W-N4.4 background có PENDING_DELETE_FLUSH_ALARM branch trong onAlarm + schedule sau top-level flush',
  bgSrc.includes('PENDING_DELETE_FLUSH_ALARM') &&
    /flushOrphanedPendingDeleteCommits\('respect-expiry'\)\.then\(scheduleOrphanExpiryAlarm\)/.test(bgSrc),
  'orphan chưa hết hạn không có ai dọn sau expiry khi SW ngủ',
)

function fnBody(src, name) {
  const i = src.indexOf(`async function ${name}(`)
  if (i === -1) return ''
  let depth = 0
  let j = src.indexOf('{', i)
  const start = j
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1) }
  }
  return ''
}
check('W-N5.1 notes.ts persistCache dùng mergeSnapshotWithStored',
  fnBody(notesSrc, 'persistCache').includes('mergeSnapshotWithStored('),
  'persistCache notes vẫn ghi đè toàn mảng')
check('W-N5.2 calendarEvents.ts persistCache dùng mergeSnapshotWithStored',
  fnBody(calSrc, 'persistCache').includes('mergeSnapshotWithStored('),
  'persistCache calendar vẫn ghi đè toàn mảng')
check('W-N5.3 sync.service.ts syncFromCache merge với đĩa trước khi set (≥4 lần xuất hiện)',
  (syncSrc.match(/mergeSnapshotWithStored/g) ?? []).length >= 4,
  `count=${(syncSrc.match(/mergeSnapshotWithStored/g) ?? []).length} — SW vẫn đè cache bằng snapshot đầu-sync`)

check('W-N11.1 pendingDeleteCommit: register/unregister/flush bọc withWebLock (≥3)',
  (pdcSrc.match(/withWebLock\(/g) ?? []).length >= 3,
  `count=${(pdcSrc.match(/withWebLock\(/g) ?? []).length}`)
check('W-N11.2 syncConflict: stash/remove bọc withWebLock (≥2)',
  (scSrc.match(/withWebLock\(/g) ?? []).length >= 2,
  `count=${(scSrc.match(/withWebLock\(/g) ?? []).length}`)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/N4-N5-N11-multi-context.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix N4+N5+N11 đúng spec. (Chạy thêm test C2 cũ để xác nhận không vỡ.)')
