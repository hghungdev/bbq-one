/**
 * FAILING TEST — S2C1.4: đường push của SW / local-first mã hóa hoặc fail-closed.
 *
 * Chạy:   node specs/S2C1.4-push-paths-encrypt.test.mjs   (Node ≥ 20 — WebCrypto thật)
 *
 * RED trên 3be1edf:
 *   - T1 fail: syncFromCache (SW alarm / auto-sync) không biết account → đẩy row plaintext lên server
 *              dù account đã bật mã hóa.
 *   - T2 fail: pushLocalToCloud (sau login) upsert ghi chú local-mode dạng plaintext vào account đã
 *              bật mã hóa.
 *   - W  fail: caller chưa truyền resolveAccountForPush; sync tay chưa fail-closed; mở khóa xong
 *              không kích hoạt đẩy phần bị giữ lại.
 * GREEN sau khi áp specs/S2C1.4-push-paths-encrypt.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

if (typeof globalThis.crypto?.subtle !== 'object') {
  console.error('Node này không có WebCrypto (cần Node ≥ 20). Bỏ chạy.')
  process.exit(1)
}

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

/** Thân hàm — bỏ qua `{` trong kiểu tham số / kiểu trả về (thân luôn mở bằng `{` cuối dòng). */
function extractFn(src, fnName) {
  const start = src.indexOf(`function ${fnName}(`)
  if (start === -1) return null
  let depth = 0
  let i = src.indexOf('{\n', start)
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

const secureCrypto = loadTsModule(path.join(ROOT, 'src', 'utils', 'secureCrypto.ts'), {})
const acctUtils = loadTsModule(path.join(ROOT, 'src', 'utils', 'accountCrypto.ts'), {
  '@/utils/secureCrypto': secureCrypto,
})
const contentK = await acctUtils.deriveContentKey(acctUtils.generateDekBytes())
const v2Ready = await secureCrypto.encryptFieldV2('đã mã hóa sẵn', contentK, 'k1')
const decryptsTo = async (v, plain) => {
  try {
    return secureCrypto.parseEnvelopeV2(v) !== null && (await secureCrypto.decryptField(v, contentK)) === plain
  } catch {
    return false
  }
}

// ── chrome.storage.local giả cho syncFromCache ───────────────────────────────
const disk = new Map()
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        const out = {}
        for (const k of Array.isArray(keys) ? keys : [keys]) if (disk.has(k)) out[k] = structuredClone(disk.get(k))
        return out
      },
      set: async (obj) => {
        for (const [k, v] of Object.entries(obj)) disk.set(k, structuredClone(v))
      },
    },
  },
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('T1 — services/sync.service.ts syncFromCache(resolveAccount) (CODE THẬT)')

const KEYS = { NOTES_CACHE_KEY: 'notes_cache', NOTE_BODIES_CACHE_KEY: 'note_bodies_cache', FOLDERS_CACHE_KEY: 'folders_cache' }
const pushed = []
const emptyList = async () => []
const syncMod = loadTsModule(path.join(ROOT, 'src', 'services', 'sync.service.ts'), {
  '@/constants/storage': KEYS,
  '@/constants/calendar': { CALENDAR_EVENTS_CACHE_KEY: 'calendar_events_cache' },
  '@/utils/secureCrypto': secureCrypto,
  '@/utils/syncConflict': { isSyncConflictError: () => false, stashConflictBackup: async () => {} },
  './calendarEvents.service': { calendarEventsService: { getAll: emptyList } },
  './noteBodies.service': {
    noteBodiesService: {
      getAll: emptyList,
      update: async (id, payload) => {
        pushed.push({ table: 'note_bodies', id, ...payload })
        return { id, updated_at: '2026-01-03T00:00:00.000Z', synced_at: '2026-01-03T00:00:00.000Z' }
      },
    },
  },
  './notes.service': {
    notesService: {
      getAll: emptyList,
      update: async (id, payload) => {
        pushed.push({ table: 'notes', id, ...payload })
        return { id, updated_at: '2026-01-03T00:00:00.000Z', synced_at: '2026-01-03T00:00:00.000Z' }
      },
    },
  },
  './localFirst/authMode': { isAuthenticated: async () => true, getCurrentUserId: async () => 'u1' },
  './localFirst/dataOwner.service': { isPushAllowedFor: async () => true },
})

const dirty = { updated_at: '2026-01-02T00:00:00.000Z', synced_at: '2026-01-01T00:00:00.000Z' }
function seedDisk() {
  disk.clear()
  disk.set(KEYS.NOTES_CACHE_KEY, [
    { id: 'n-plain', folder_id: null, title: 'RÕ-SW', tags: [], ...dirty },
    { id: 'n-v2', folder_id: null, title: v2Ready, tags: [], ...dirty },
  ])
  disk.set(KEYS.NOTE_BODIES_CACHE_KEY, [
    { id: 'b-plain', note_id: 'n-plain', label: 'NHÃN-RÕ', content: 'ND-RÕ-SW', position: 0, ...dirty },
  ])
  disk.set(KEYS.FOLDERS_CACHE_KEY, [])
  pushed.length = 0
}

async function runSw(resolver) {
  seedDisk()
  await syncMod.syncService.syncFromCache(resolver)
  return pushed.slice()
}

{
  const out = await runSw(async () => ({ key: null, kid: 'k1' }))
  const plainLeaked = JSON.stringify(out).includes('RÕ-SW')
  check(
    'T1.1 bật nhưng khóa / chưa biết → row plaintext KHÔNG lên server; row v2 vẫn push',
    !plainLeaked && out.some((p) => p.id === 'n-v2'),
    `pushed=${JSON.stringify(out.map((p) => [p.id, String(p.title ?? p.content).slice(0, 12)]))}`,
  )
}
{
  const out = await runSw(async () => ({ key: contentK, kid: 'k1' }))
  const n = out.find((p) => p.id === 'n-plain')
  const b = out.find((p) => p.id === 'b-plain')
  check(
    'T1.2 có key → row plaintext lên server dạng v2 giải mã được',
    (await decryptsTo(n?.title, 'RÕ-SW')) && (await decryptsTo(b?.content, 'ND-RÕ-SW')),
    `n=${String(n?.title).slice(0, 20)} b=${String(b?.content).slice(0, 20)}`,
  )
}
{
  const out = await runSw(async () => {
    throw new Error('session đọc lỗi')
  })
  check(
    'T1.3 resolver lỗi → fail-closed (không đẩy plaintext)',
    !JSON.stringify(out).includes('RÕ-SW'),
    `pushed=${JSON.stringify(out.map((p) => p.id))}`,
  )
}
{
  const out = await runSw(async () => null)
  check(
    'T1.4 account tắt → push như cũ (plaintext — đúng hành vi khi chưa bật mã hóa)',
    out.find((p) => p.id === 'n-plain')?.title === 'RÕ-SW',
    `pushed=${JSON.stringify(out.map((p) => [p.id, p.title]))}`,
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — services/localFirst/syncEngine.service.ts pushLocalToCloud (CODE THẬT)')

const localMem = new Map()
const localStoreMock = {
  localStore: {
    getArray: async (k) => structuredClone(localMem.get(k) ?? []),
    setArray: async (k, v) => {
      localMem.set(k, structuredClone(v))
    },
    clearAllLocal: async () => localMem.clear(),
  },
}
const typesLocalFirst = loadTsModule(path.join(ROOT, 'src', 'types', 'localFirst.ts'), {})
const LK = typesLocalFirst.LOCAL_STORAGE_KEYS
const upserts = []
let pushCtx = null
let pushCtxThrows = false
const engine = loadTsModule(path.join(ROOT, 'src', 'services', 'localFirst', 'syncEngine.service.ts'), {
  '@/services/supabase': {
    supabase: {
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
      from: (table) => ({
        upsert: async (row) => {
          upserts.push({ table, row })
          return { error: null }
        },
      }),
    },
  },
  './authMode': { getCurrentUserId: async () => 'u1' },
  './dataOwner.service': { isPushAllowedFor: async () => true },
  './localStore.service': localStoreMock,
  '@/types/localFirst': typesLocalFirst,
  './conflictDetector': { detectSyncConflicts: async () => ({ totalConflicts: 0 }) },
  '@/utils/secureCrypto': secureCrypto,
  '@/utils/accountSession': {
    resolveAccountForPush: async () => {
      if (pushCtxThrows) throw new Error('session đọc lỗi')
      return pushCtx
    },
  },
})

const LOCAL_BASE = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }
function seedLocal() {
  localMem.clear()
  localMem.set(LK.folders, [{ id: 'f-sec', name: 'Két', is_secure: true, ...LOCAL_BASE }])
  localMem.set(LK.notes, [
    { id: 'ln-plain', folder_id: null, title: 'GHI-CHÚ-LOCAL', tags: [], ...LOCAL_BASE },
    { id: 'ln-v2', folder_id: null, title: v2Ready, tags: [], ...LOCAL_BASE },
    { id: 'ln-sec', folder_id: 'f-sec', title: 'retronote:1:AAAA:BBBB', tags: [], ...LOCAL_BASE },
  ])
  localMem.set(LK.noteBodies, [
    { id: 'lb-plain', note_id: 'ln-plain', label: 'NHÃN-LOCAL', content: 'ND-LOCAL', position: 0, ...LOCAL_BASE },
  ])
  upserts.length = 0
}

async function runLocal(ctx, throws = false) {
  seedLocal()
  pushCtx = ctx
  pushCtxThrows = throws
  const result = await engine.pushLocalToCloud('use-local')
  return { result, ups: upserts.slice() }
}

{
  const { ups } = await runLocal({ key: contentK, kid: 'k1' })
  const n = ups.find((u) => u.row.id === 'ln-plain')?.row
  const b = ups.find((u) => u.row.id === 'lb-plain')?.row
  check(
    'T2.1 có key → ghi chú local-mode lên account dạng v2 giải mã được (title + label + content)',
    (await decryptsTo(n?.title, 'GHI-CHÚ-LOCAL')) &&
      (await decryptsTo(b?.label, 'NHÃN-LOCAL')) &&
      (await decryptsTo(b?.content, 'ND-LOCAL')),
    `n=${String(n?.title).slice(0, 20)} b=${String(b?.content).slice(0, 20)}`,
  )
  check(
    'T2.2 envelope sẵn (v2, secure folder v1) đi nguyên vẹn — không mã hóa chồng',
    ups.find((u) => u.row.id === 'ln-v2')?.row.title === v2Ready &&
      ups.find((u) => u.row.id === 'ln-sec')?.row.title === 'retronote:1:AAAA:BBBB',
    JSON.stringify(ups.map((u) => [u.row.id, String(u.row.title ?? '').slice(0, 14)])),
  )
}
{
  const { result, ups } = await runLocal({ key: null, kid: 'k1' })
  const leaked = JSON.stringify(ups).match(/GHI-CHÚ-LOCAL|NHÃN-LOCAL|ND-LOCAL/g)
  const stillLocal = (localMem.get(LK.notes) ?? []).some((n) => n.id === 'ln-plain') &&
    (localMem.get(LK.noteBodies) ?? []).some((b) => b.id === 'lb-plain')
  check(
    'T2.3 bật nhưng khóa → không upsert plaintext; note + body GIỮ LẠI ở local (không mất)',
    !leaked && stillLocal && !ups.some((u) => u.row.id === 'lb-plain'),
    `leaked=${JSON.stringify(leaked)} stillLocal=${stillLocal}`,
  )
  check(
    'T2.4 giữ lại không tính là lỗi; có đếm heldForEncryption',
    result.errors.length === 0 && result.heldForEncryption === 2,
    `errors=${result.errors.length} held=${result.heldForEncryption}`,
  )
}
{
  const { ups } = await runLocal(null, true)
  check(
    'T2.5 đọc trạng thái lỗi → fail-closed',
    !JSON.stringify(ups).includes('GHI-CHÚ-LOCAL'),
    JSON.stringify(ups.map((u) => u.row.id)),
  )
}
{
  const { ups } = await runLocal(null)
  check(
    'T2.6 account tắt → upsert như cũ',
    ups.find((u) => u.row.id === 'ln-plain')?.row.title === 'GHI-CHÚ-LOCAL',
    JSON.stringify(ups.map((u) => [u.row.id, u.row.title])),
  )
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nW — wiring')

function walkSrc(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkSrc(p))
    else if (/\.(ts|vue)$/.test(e.name)) out.push(p)
  }
  return out
}
const callSites = []
for (const p of walkSrc(path.join(ROOT, 'src'))) {
  const src = fs.readFileSync(p, 'utf8')
  for (const m of src.matchAll(/syncFromCache\(([^)]*)\)/g)) {
    if (src.slice(Math.max(0, m.index - 10), m.index).includes('async ')) continue // định nghĩa
    callSites.push({ file: path.relative(ROOT, p), arg: m[1].trim() })
  }
}
check(
  'W1 mọi lời gọi syncFromCache trong src truyền resolveAccountForPush',
  callSites.length >= 2 && callSites.every((c) => c.arg === 'resolveAccountForPush'),
  JSON.stringify(callSites),
)

const syncStoreSrc = fs.readFileSync(path.join(ROOT, 'src', 'stores', 'sync.ts'), 'utf8')
const rms = extractFn(syncStoreSrc, 'runManualSync') ?? ''
check(
  'W2 sync tay: hỏi lại khi chưa biết/stale; vẫn không biết → { key: null } (fail-closed)',
  rms.includes('account.stale') && /!account\.fetched\s*\?\s*\{\s*key:\s*null/.test(rms),
  rms.replace(/\s+/g, ' ').slice(0, 200),
)

const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'App.vue'), 'utf8')
check(
  'W3 mở khóa xong → scheduleAutoSync (đẩy phần bị giữ lại)',
  (extractFn(appSrc, 'onAccountUnlocked') ?? '').includes('scheduleAutoSync('),
  'ghi chú local-mode kẹt ở local tới lần sync sau',
)
check(
  'W4 biết trạng thái xong + còn local-first pending → scheduleAutoSync',
  // S2C1.6: hasPendingSyncWork (gồm cả local-first lẫn dirty row) cũng đạt.
  /(hasLocalFirstPending|hasPendingSyncWork)\(\)\)\s*scheduleAutoSync\(/.test(extractFn(appSrc, 'refreshAccountCryptoStatus') ?? ''),
  'push lúc login (trạng thái chưa biết) giữ lại ghi chú, không ai đẩy lại',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2C1.4-push-paths-encrypt.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2C1.4 đúng spec.')
