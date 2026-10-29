/**
 * FAILING TEST — F3: sửa / xóa cả chuỗi sự kiện lặp (series_id).
 *
 * Chạy:   node specs/F3-calendar-series.test.mjs
 * GREEN sau khi áp specs/F3-calendar-series.spec.md.
 *
 * Store THẬT (calendarEvents.ts) trên Vue + Pinia thật; pendingDeleteCommit / localCalendarEvents THẬT; chrome.storage giả.
 */

import fs from 'node:fs'
import path from 'node:path'
import { types } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')
const vue = require('vue')
const pinia = require('pinia')

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}
function loadTs(rel, mocks = {}) {
  const src = read(...rel.split('/'))
  if (!src) throw new Error(`chưa có ${rel}`)
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  const req = (s) => {
    if (s in mocks) return mocks[s]
    throw new Error(`Unmocked import in ${path.basename(rel)}: ${s}`)
  }
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports)
  return mod.exports
}

// ── chrome.storage giả: chuyển dữ liệu như Chrome (Proxy → object theo khóa — C11), đếm số lần ghi từng khóa ──
function chromeSerialize(v) {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v) && !types.isProxy(v)) return v.map(chromeSerialize)
  const out = {}
  for (const k of Object.keys(v)) out[k] = chromeSerialize(v[k])
  return out
}
const localMem = new Map()
const writes = new Map()
const writesOf = (key) => writes.get(key) ?? 0
globalThis.chrome = {
  storage: {
    local: {
      get: async (k) => {
        const keys = k == null ? [...localMem.keys()] : Array.isArray(k) ? k : [k]
        const out = {}
        for (const key of keys) if (localMem.has(key)) out[key] = structuredClone(localMem.get(key))
        return out
      },
      set: async (obj) => {
        for (const [key, v] of Object.entries(obj)) {
          localMem.set(key, chromeSerialize(v))
          writes.set(key, writesOf(key) + 1)
        }
      },
      remove: async (k) => {
        for (const key of Array.isArray(k) ? k : [k]) localMem.delete(key)
      },
      getBytesInUse: async () => 0,
    },
  },
}

const read2 = (...p) => { try { return fs.readFileSync(path.join(ROOT, ...p), 'utf8') } catch { return '' } }
const storageConsts = loadTs('src/constants/storage.ts')
const calDate = loadTs('src/utils/calendarDate.ts')
const T0 = '2026-10-01T00:00:00.000Z'
const T1 = '2026-10-02T00:00:00.000Z'
const webLock = { PENDING_DELETES_LOCK: 'pd', withWebLock: async (_n, fn) => fn() }

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — pendingDeleteCommit: một lượt xóa nhiều sự kiện (CODE THẬT)')
const flushed = []
const PDC = loadTs('src/services/pendingDeleteCommit.service.ts', {
  '@/constants/storage': storageConsts,
  '@/services/bookmarks.service': { bookmarksService: { deleteBackup: async (id) => flushed.push(`bookmark:${id}`) } },
  '@/services/calendarEvents.service': { calendarEventsService: { delete: async (id) => flushed.push(`calendar:${id}`) } },
  '@/services/notes.service': { notesService: { delete: async (id) => flushed.push(`note:${id}`) } },
  '@/utils/webLock': webLock,
})
{
  const fn = PDC.parseUndoDeleteTargets
  check(
    "T1.1 parseUndoDeleteTargets: 'calendar:a,b,c' → 3 sự kiện; 'calendar:x' / 'note:y' như cũ; parseUndoDeleteActionId giữ nguyên",
    typeof fn === 'function' &&
      JSON.stringify(fn('calendar:a,b,c')) === JSON.stringify([{ kind: 'calendar', entityId: 'a' }, { kind: 'calendar', entityId: 'b' }, { kind: 'calendar', entityId: 'c' }]) &&
      JSON.stringify(fn('calendar:x')) === JSON.stringify([{ kind: 'calendar', entityId: 'x' }]) &&
      JSON.stringify(fn('note:y')) === JSON.stringify([{ kind: 'note', entityId: 'y' }]) &&
      fn('lạ:z').length === 0 &&
      JSON.stringify(PDC.parseUndoDeleteActionId('note:y')) === JSON.stringify({ kind: 'note', entityId: 'y' }),
    typeof fn === 'function' ? JSON.stringify(fn('calendar:a,b,c')) : 'chưa có parseUndoDeleteTargets',
  )
  localMem.clear()
  const now = Date.now()
  localMem.set(storageConsts.BBQ_PENDING_DELETE_COMMITS_KEY, [
    { id: 'calendar:s1,s2,s3', expiresAt: now + 5_000 },
    { id: 'note:n1', expiresAt: now + 5_000 },
  ])
  const live = (await PDC.listUnexpiredPendingDeletes()).map((p) => `${p.kind}:${p.entityId}`).join(' ')
  check('T1.2 listUnexpiredPendingDeletes trả TỪNG sự kiện của lượt xóa nhiều (N4 ẩn đúng khi tải lại)', live === 'calendar:s1 calendar:s2 calendar:s3 note:n1', live)
  localMem.set(storageConsts.BBQ_PENDING_DELETE_COMMITS_KEY, [{ id: 'calendar:s1,s2,s3', expiresAt: 0 }])
  await PDC.flushOrphanedPendingDeleteCommits('force')
  check('T1.3 popup bị đóng giữa chừng → flush xóa MỌI sự kiện trong lượt', flushed.join(' ') === 'calendar:s1 calendar:s2 calendar:s3', flushed.join(' '))
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — stores/calendarEvents.ts: chuỗi sự kiện (CODE THẬT)')
let seq = 0
const deleted = []
const svc = {
  getAll: async () => [],
  create: async (input) => ({
    id: `ev${++seq}`, user_id: '', event_date: input.event_date, title: input.title, description: input.description ?? '',
    is_done: false, position: input.position ?? 0, color: input.color ?? null, start_time: null, end_time: null,
    created_at: T0, updated_at: T0, synced_at: null, ...(input.series_id ? { series_id: input.series_id } : {}),
  }),
  update: async (id, updates, opts) => ({ ...opts.row, ...updates, updated_at: T1 }),
  delete: async (id) => { deleted.push(id) },
}
const scheduled = []
let useCal = null
try {
  useCal = loadTs('src/stores/calendarEvents.ts', {
    pinia,
    vue,
    '@/constants/calendar': loadTs('src/constants/calendar.ts'),
    '@/services/calendarEvents.service': { calendarEventsService: svc },
    '@/services/localFirst/localCalendarEvents.service': { localCalendarEventsService: {} },
    '@/utils/calendarDate': calDate,
    '@/utils/calendarRecurrence': loadTs('src/utils/calendarRecurrence.ts', { '@/utils/calendarDate': calDate }),
    '@/utils/withTimeout': { withTimeout: (p) => p },
    '@/services/networkReachability.service': { isOnline: () => true },
    '@/utils/networkErrors': { isNetworkError: () => false },
    '@/utils/syncConflict': { isSyncConflictError: () => false, nextLocalUpdatedAt: () => T1 },
    '@/services/autoSync.service': { scheduleAutoSync: () => {} },
    '@/services/sync.service': loadTs('src/services/sync.service.ts', {
      '@/constants/storage': storageConsts,
      '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
      '@/utils/secureCrypto': {},
      './calendarEvents.service': { calendarEventsService: {} },
      './noteBodies.service': { noteBodiesService: {} },
      './notes.service': { notesService: {} },
      './localFirst/authMode': {},
      './localFirst/dataOwner.service': {},
      '@/utils/syncConflict': { isSyncConflictError: () => false, stashConflictBackup: async () => {} },
    }),
    '@/stores/undoToast': { useUndoToastStore: () => ({ schedule: async (a) => { scheduled.push(a) } }) },
    '@/stores/uiLang': { useLangStore: () => ({ t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k) }) },
    '@/utils/cacheWrite': loadTs('src/utils/cacheWrite.ts'),
    '@/utils/rowsEqual': loadTs('src/utils/rowsEqual.ts'),
  }).useCalendarEventsStore
} catch (e) {
  check('T2.0 calendar store load được', false, e.message)
}
if (useCal) {
  localMem.clear()
  pinia.setActivePinia(pinia.createPinia())
  const C = useCal()
  const CK = 'calendar_events_cache'
  const { created } = await C.createRecurringEvents({ event_date: '2026-11-03', title: 'Họp tuần', description: '' }, { freq: 'weekly', count: 4 })
  const single = await C.createEvent({ event_date: '2026-11-04', title: 'Một lần', description: '' })
  const gym = (await C.createRecurringEvents({ event_date: '2026-11-05', title: 'Gym', description: '' }, { freq: 'monthly', count: 2 })).created
  const sid = created[0]?.series_id
  check(
    'T2.1 tạo lặp × 4 → cùng MỘT series_id (khác rỗng); sự kiện đơn không có series_id; chuỗi khác → series_id khác',
    created.length === 4 && typeof sid === 'string' && sid.length > 0 && created.every((e) => e.series_id === sid) &&
      !single.series_id && gym.length === 2 && gym[0].series_id && gym[0].series_id === gym[1].series_id && gym[0].series_id !== sid,
    JSON.stringify(created.map((e) => e.series_id)),
  )
  const [e1, e2, e3, e4] = created.map((e) => e.id)
  const titles = () => C.events.filter((e) => e.series_id === sid).sort((a, b) => a.event_date.localeCompare(b.event_date)).map((e) => e.title).join(' | ')
  check(
    'T2.2 seriesSize / seriesTargets: 4 trong chuỗi; đơn = 1; "following" từ lần 2 = lần 2–4 theo ngày',
    typeof C.seriesSize === 'function' && C.seriesSize(e2) === 4 && C.seriesSize(single.id) === 1 &&
      typeof C.seriesTargets === 'function' && C.seriesTargets(e2, 'following').map((e) => e.id).join() === [e2, e3, e4].join() &&
      C.seriesTargets(e2, 'one').map((e) => e.id).join() === e2 && C.seriesTargets(single.id, 'all').map((e) => e.id).join() === single.id,
    'thiếu / sai seriesSize / seriesTargets',
  )
  if (typeof C.updateSeries === 'function') {
    await C.updateSeries(e2, 'following', { title: 'Họp tuần (mới)' })
    const a = titles()
    await C.updateSeries(e1, 'one', { title: 'Chỉ lần 1' })
    const b = titles()
    await C.updateSeries(e3, 'all', { title: 'Cả chuỗi' })
    const c = titles()
    check(
      'T2.3 updateSeries: following / one / all đổi đúng các lần; chuỗi khác + sự kiện đơn giữ nguyên',
      a === 'Họp tuần | Họp tuần (mới) | Họp tuần (mới) | Họp tuần (mới)' && b === 'Chỉ lần 1 | Họp tuần (mới) | Họp tuần (mới) | Họp tuần (mới)' &&
        c === 'Cả chuỗi | Cả chuỗi | Cả chuỗi | Cả chuỗi' && C.events.filter((e) => e.title === 'Gym').length === 2 &&
        C.events.find((e) => e.id === single.id)?.title === 'Một lần',
      `${a} / ${b} / ${c}`,
    )
  } else check('T2.3 updateSeries tồn tại', false, 'chưa có updateSeries')
  if (typeof C.deleteSeries === 'function') {
    scheduled.length = 0
    await C.deleteSeries(e3, 'following')
    const disk = (localMem.get(CK) ?? []).map((e) => e.id)
    check(
      'T2.4 deleteSeries following từ lần 3 → lần 3–4 mất khỏi RAM + cache; MỘT lượt hoàn tác id `calendar:e3,e4`',
      !C.events.some((e) => e.id === e3 || e.id === e4) && !disk.includes(e3) && !disk.includes(e4) && disk.includes(e2) &&
        scheduled.length === 1 && scheduled[0].id === `calendar:${e3},${e4}`,
      `RAM=${C.events.filter((e) => e.series_id === sid).length} · lượt=${scheduled.map((s) => s.id).join(' ')}`,
    )
    await scheduled[0].undo()
    const disk2 = (localMem.get(CK) ?? []).map((e) => e.id)
    check('T2.5 hoàn tác → cả 2 quay lại RAM + cache', C.seriesSize(e1) === 4 && disk2.includes(e3) && disk2.includes(e4), `size=${C.seriesSize(e1)}`)
    scheduled.length = 0
    await C.deleteSeries(e2, 'all')
    await scheduled[0].commit()
    check(
      'T2.6 deleteSeries all + hết hoàn tác → xóa cả 4 ở service; chuỗi khác + sự kiện đơn còn',
      [e1, e2, e3, e4].every((id) => deleted.includes(id)) && !C.events.some((e) => e.series_id === sid) &&
        C.events.filter((e) => e.title === 'Gym').length === 2 && C.events.some((e) => e.id === single.id),
      `deleted=${deleted.join(',')}`,
    )
  } else check('T2.4 deleteSeries tồn tại', false, 'chưa có deleteSeries')
  scheduled.length = 0
  await C.deleteEvent(single.id)
  check('T2.7 deleteEvent (sự kiện đơn) giữ id hành động `calendar:<id>`', scheduled[0]?.id === `calendar:${single.id}`, scheduled[0]?.id)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — localCalendarEvents.service: lưu series_id khi có (CODE THẬT)')
{
  localMem.clear()
  const localStore = loadTs('src/services/localFirst/localStore.service.ts', { '@/types/localFirst': loadTs('src/types/localFirst.ts') })
  const LC = loadTs('src/services/localFirst/localCalendarEvents.service.ts', {
    '@/constants/calendar': loadTs('src/constants/calendar.ts'),
    './localStore.service': localStore,
    '@/types/localFirst': loadTs('src/types/localFirst.ts'),
  }).localCalendarEventsService
  const a = await LC.create({ event_date: '2026-11-03', title: 'A', description: '', series_id: 's-1' })
  const b = await LC.create({ event_date: '2026-11-03', title: 'B', description: '' })
  check('T3.1 có series_id → lưu; không có → KHÔNG thêm trường (sự kiện đơn không gửi cột mới)', a.series_id === 's-1' && !('series_id' in b), JSON.stringify({ a: a.series_id, b: 'series_id' in b }))
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — nối dây (tĩnh)')
const svcSrc = read2('src', 'services', 'calendarEvents.service.ts')
const insertBlock = svcSrc.match(/\.insert\(\{[\s\S]*?\}\)/)?.[0] ?? ''
check('T4.1 server create: chỉ gửi series_id khi có (…(input.series_id ? { series_id } : {}))', /\.\.\.\(input\.series_id \? \{ series_id: input\.series_id \} : \{\}\)/.test(insertBlock), insertBlock.replace(/\s+/g, ' '))
const calTypes = read2('src', 'types', 'calendar.ts')
check('T4.2 types: CalendarEvent.series_id?: string | null; CalendarEventCreateInput.series_id', /series_id\?: string \| null/.test(calTypes.match(/export interface CalendarEvent \{[\s\S]*?\n\}/)?.[0] ?? '') && /series_id\?: string \| null/.test(calTypes.match(/export type CalendarEventCreateInput[\s\S]*?\n\}/)?.[0] ?? ''), 'thiếu kiểu')
const mig = read2('supabase', 'migrations', '018_calendar_series.sql')
check("T4.3 migration 018: ADD COLUMN IF NOT EXISTS series_id uuid NULL + NOTIFY pgrst, 'reload schema'", /ALTER TABLE public\.calendar_events ADD COLUMN IF NOT EXISTS series_id uuid NULL;/.test(mig) && /NOTIFY pgrst, 'reload schema';/.test(mig), mig ? 'nội dung sai' : 'chưa có file')
const modal = read2('src', 'components', 'calendar', 'CalendarEventModal.vue')
check(
  'T4.4 form sửa: nhóm "Áp dụng cho" (radiogroup 3 phạm vi) khi editSeriesSize > 1; lưu → store.updateSeries(…, editScope.value, …)',
  /v-if="!isCreating && editSeriesSize > 1"/.test(modal) && /SERIES_SCOPES/.test(modal) && /role="radiogroup"[\s\S]*?calendar\.series\.applyTo/.test(modal) &&
    /store\.updateSeries\(store\.activeEventId, editScope\.value, \{ title \}\)/.test(modal),
  'form sửa chưa có phạm vi',
)
check(
  'T4.5 xóa: RetroConfirm có lựa chọn phạm vi khi chuỗi > 1; xác nhận → store.deleteSeries(id, deleteScope.value); RetroConfirm có <slot />',
  /<RetroConfirm[\s\S]*?deleteSeriesSize > 1[\s\S]*?<\/RetroConfirm>/.test(modal) && /store\.deleteSeries\(id, deleteScope\.value\)/.test(modal) &&
    /<slot \/>/.test(read2('src', 'components', 'ui', 'RetroConfirm.vue')),
  'xóa chưa có phạm vi',
)
check(
  'T4.6 danh sách ngày: dấu ↻ (icon repeat) cho sự kiện thuộc chuỗi; icon repeat trong bộ chung',
  /v-if="store\.seriesSize\(ev\.id\) > 1"[\s\S]{0,300}name="repeat"/.test(modal) && /\brepeat: \[/.test(read2('src', 'components', 'ui', 'icons.ts')),
  'thiếu dấu ↻',
)
const vi = read2('src', 'i18n', 'vi.ts')
const en = read2('src', 'i18n', 'en.ts')
const keys = ['calendar.series.applyTo', 'calendar.series.one', 'calendar.series.following', 'calendar.series.all', 'calendar.series.willChange', 'calendar.series.willDelete', 'calendar.series.deleteTitle', 'calendar.series.badge', 'undo.calendarSeriesDeleted']
const missing = keys.filter((k) => !vi.includes(`'${k}'`) || !en.includes(`'${k}'`))
check('T4.7 i18n vi + en cho chuỗi sự kiện', missing.length === 0, missing.join(', '))

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/F3-calendar-series.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. F3 đúng spec.')
