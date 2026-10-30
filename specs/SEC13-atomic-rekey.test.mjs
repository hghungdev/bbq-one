/**
 * FAILING TEST — SEC-13: đổi khóa thư mục bảo mật (Nâng cấp / Đổi mật khẩu / Bật bảo mật) phải NGUYÊN TỬ.
 * Trước: ghi TỪNG ghi chú rồi mới ghi salt thư mục → mạng rớt giữa chừng = ghi chú mang bản mã của salt không được lưu →
 * mất vĩnh viễn (PoC 2026-10-30). Sau: tính sẵn mọi bản mã trong RAM → MỘT lần ghi (RPC giao dịch / một lần
 * chrome.storage.local.set) → lỗi thì không gì đổi.
 *
 * Chạy:   node specs/SEC13-atomic-rekey.test.mjs
 * GREEN sau khi áp specs/SEC13-atomic-rekey.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
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
const tryLoad = (rel, mocks) => {
  try {
    return loadTs(rel, mocks)
  } catch (e) {
    return { __error: e.message }
  }
}
const errMsg = async (fn) => {
  try {
    await fn()
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
const T = '2026-10-30T00:00:00.000Z'
const C = loadTs('src/utils/secureCrypto.ts')
const PW = loadTs('src/utils/passwordStrength.ts')

// ── T1 store: mọi đường đổi khóa đi qua MỘT lần ghi ───────────────────────────────────────────────────────────────
console.log('T1 — stores/secureFolder.ts dùng secureRekeyService.apply (một lần ghi)')
const perRowWrites = []
const applyCalls = []
let applyFails = false
const foldersState = vue.reactive({ folders: [], reorderFoldersByUpdated() {}, async persistCache() {}, async loadAll() {} })
let storeRef = null
const notesState = vue.reactive({
  notes: [], bodies: [], persistCalls: 0,
  bodiesForNote(id) { return this.bodies.filter((b) => b.note_id === id) },
  async loadAll() { if (storeRef) await storeRef.decryptLoadedSecureRows() },
  async persistCache() { this.persistCalls++ },
})
const rekeyMock = {
  secureRekeyService: {
    async apply(p) {
      applyCalls.push(JSON.parse(JSON.stringify(p)))
      if (applyFails) throw new Error('Failed to fetch (mất mạng)')
      const now = new Date(Date.now() + 1000).toISOString()
      const f = foldersState.folders.find((x) => x.id === p.folderId)
      return {
        folder: { ...f, is_secure: true, secure_salt: p.secure.salt, pbkdf2_iterations: p.secure.iterations, secure_verifier_enc: p.secure.verifier, updated_at: now },
        notes: p.notes.map((n) => ({ id: n.id, updated_at: now, synced_at: now })),
        bodies: p.bodies.map((b) => ({ id: b.id, updated_at: now, synced_at: now })),
      }
    },
  },
}
const perRow = (kind) => async (id) => { perRowWrites.push(`${kind}:${id}`); throw new Error(`không được ghi từng dòng (${kind})`) }
const storeMod = tryLoad('src/stores/secureFolder.ts', {
  pinia, vue,
  '@/constants/storage': { FOLDERS_CACHE_KEY: 'folders_cache' },
  '@/types/localFirst': { LOCAL_STORAGE_KEYS: { folders: 'bbqone_local_folders' } },
  '@/services/folders.service': { foldersService: { update: perRow('folder') } },
  '@/services/notes.service': { notesService: { update: perRow('note') } },
  '@/services/noteBodies.service': { noteBodiesService: { update: perRow('body') } },
  '@/services/secureRekey.service': rekeyMock,
  '@/stores/folders': { useFoldersStore: () => foldersState },
  '@/stores/notes': { useNotesStore: () => notesState },
  '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
  '@/utils/secureCrypto': C,
  '@/utils/passwordStrength': PW,
})

async function fixture(id, pw, iterations, withNotes = true) {
  const salt = C.generateSalt16()
  const key = await C.deriveKeyFromPassword(pw, salt, iterations)
  const folder = { id, user_id: 'u', name: id, position: 0, created_at: T, updated_at: T, is_secure: true, secure_salt: C.saltToBase64(salt), pbkdf2_iterations: iterations, secure_verifier_enc: await C.encryptField(C.SECURE_VERIFIER_PLAINTEXT, key) }
  foldersState.folders = [folder]
  notesState.notes = withNotes ? [
    { id: `${id}-n1`, folder_id: id, title: await C.encryptField('Một', key), updated_at: T, synced_at: T },
    { id: `${id}-n2`, folder_id: id, title: await C.encryptField('Hai', key), updated_at: T, synced_at: T },
  ] : []
  notesState.bodies = withNotes ? [
    { id: `${id}-b1`, note_id: `${id}-n1`, label: await C.encryptField('', key), content: await C.encryptField('<p>1</p>', key), updated_at: T, synced_at: T },
    { id: `${id}-b2`, note_id: `${id}-n2`, label: await C.encryptField('', key), content: await C.encryptField('<p>2</p>', key), updated_at: T, synced_at: T },
  ] : []
  return { folder, key }
}

if (!storeMod.useSecureFolderStore) {
  check('SEC13.0 store load được', false, storeMod.__error)
} else {
  pinia.setActivePinia(pinia.createPinia())
  const S = storeMod.useSecureFolderStore()
  storeRef = S

  // SEC13.1 / 13.2: Nâng cấp khi đang mở, mạng rớt → không gì đổi
  const { folder: f1 } = await fixture('f1', 'old-pass-12', 310_000)
  await S.unlockFolder('f1', 'old-pass-12')
  const ramBefore = JSON.stringify([notesState.notes.map((n) => n.title), notesState.bodies.map((b) => b.content)])
  applyCalls.length = 0
  perRowWrites.length = 0
  applyFails = true
  const failErr = await errMsg(() => S.upgradeIterations('f1', 'old-pass-12'))
  applyFails = false
  const ramAfterFail = JSON.stringify([notesState.notes.map((n) => n.title), notesState.bodies.map((b) => b.content)])
  check('SEC13.1 không còn ghi TỪNG dòng (notesService / noteBodiesService / foldersService.update) — chỉ một lần secureRekeyService.apply',
    applyCalls.length === 1 && perRowWrites.length === 0, `apply=${applyCalls.length} perRow=${perRowWrites.join(',')}`)
  check('SEC13.2 lần ghi đó lỗi (mạng) → báo lỗi; thư mục giữ salt + số vòng cũ; RAM giữ nguyên bản rõ; khóa cũ vẫn dùng được',
    failErr !== null && foldersState.folders[0].secure_salt === f1.secure_salt && foldersState.folders[0].pbkdf2_iterations === 310_000 &&
      ramAfterFail === ramBefore && S.getKey('f1') !== null,
    `err=${failErr} salt same=${foldersState.folders[0].secure_salt === f1.secure_salt} ram same=${ramAfterFail === ramBefore} key=${S.getKey('f1') ? 'ok' : 'null'}`)

  // SEC13.3: thử lại thành công → payload đủ, mở được bằng khóa mới; RAM vẫn bản rõ + updated_at mới
  applyCalls.length = 0
  const okErr = await errMsg(() => S.upgradeIterations('f1', 'old-pass-12'))
  const p = applyCalls[0]
  let decOk = false
  try {
    const k = await C.deriveKeyFromPassword('old-pass-12', C.saltFromBase64(p.secure.salt), p.secure.iterations)
    const t = await Promise.all(p.notes.map((n) => C.decryptField(n.title, k)))
    const c = await Promise.all(p.bodies.map((b) => C.decryptField(b.content, k)))
    const v = await C.decryptField(p.secure.verifier, k)
    decOk = t.join('|') === 'Một|Hai' && c.join('|') === '<p>1</p>|<p>2</p>' && v === C.SECURE_VERIFIER_PLAINTEXT
  } catch {}
  check('SEC13.3 thành công: payload có expectedSalt = salt cũ, đủ 2 ghi chú + 2 section, 600.000 vòng, mọi bản mã mở được bằng mật khẩu + salt mới; RAM bản rõ + updated_at mới; khóa mới dùng được',
    okErr === null && p?.expectedSalt === f1.secure_salt && p?.notes.length === 2 && p?.bodies.length === 2 && p?.secure.iterations === 600_000 && decOk &&
      notesState.notes[0].title === 'Một' && notesState.notes[0].updated_at !== T && foldersState.folders[0].secure_salt === p.secure.salt && S.getKey('f1') !== null,
    `err=${okErr} expected=${p?.expectedSalt === f1.secure_salt} n=${p?.notes.length} b=${p?.bodies.length} it=${p?.secure.iterations} dec=${decOk} ram=${notesState.notes[0].title}`)

  // SEC13.4: đổi mật khẩu khi thư mục ĐANG KHÓA (RAM bản mã) → RAM nhận bản mã mới (không bản rõ lọt ra khi đang khóa)
  pinia.setActivePinia(pinia.createPinia())
  const S2 = storeMod.useSecureFolderStore()
  storeRef = S2
  await fixture('f2', 'old-pass-22', 310_000)
  applyCalls.length = 0
  const lockedErr = await errMsg(() => S2.changePassphrase('f2', 'old-pass-22', 'New-Strong-22', 'New-Strong-22'))
  const p2 = applyCalls[0]
  let lockedDec = false
  try {
    const k = await C.deriveKeyFromPassword('New-Strong-22', C.saltFromBase64(p2.secure.salt), 600_000)
    lockedDec = (await C.decryptField(notesState.notes.find((n) => n.id === 'f2-n1').title, k)) === 'Một' || notesState.notes.find((n) => n.id === 'f2-n1').title === 'Một'
  } catch {}
  check('SEC13.4 đổi mật khẩu khi đang khóa: một lần apply, RAM giữ dạng đúng (bản mã mới hoặc bản rõ khi đã mở bằng khóa mới) và mở được bằng mật khẩu mới',
    lockedErr === null && applyCalls.length === 1 && lockedDec, `err=${lockedErr} apply=${applyCalls.length} dec=${lockedDec}`)

  // SEC13.5: Bật bảo mật → một lần apply, expectedSalt null
  pinia.setActivePinia(pinia.createPinia())
  const S3 = storeMod.useSecureFolderStore()
  storeRef = S3
  foldersState.folders = [{ id: 'f3', user_id: 'u', name: 'f3', position: 0, created_at: T, updated_at: T, is_secure: false, secure_salt: null, pbkdf2_iterations: 310_000, secure_verifier_enc: null }]
  notesState.notes = [{ id: 'f3-n1', folder_id: 'f3', title: 'Bản rõ', updated_at: T, synced_at: T }]
  notesState.bodies = [{ id: 'f3-b1', note_id: 'f3-n1', label: '', content: '<p>x</p>', updated_at: T, synced_at: T }]
  applyCalls.length = 0
  perRowWrites.length = 0
  const enErr = await errMsg(() => S3.enableSecureFolder('f3', 'Correct-Horse-9', 'Correct-Horse-9'))
  check('SEC13.5 bật bảo mật: một lần apply (expectedSalt = null, đủ ghi chú + section), không ghi từng dòng',
    enErr === null && applyCalls.length === 1 && applyCalls[0].expectedSalt === null && applyCalls[0].notes.length === 1 && applyCalls[0].bodies.length === 1 && perRowWrites.length === 0,
    `err=${enErr} apply=${applyCalls.length} expected=${applyCalls[0]?.expectedSalt} perRow=${perRowWrites.join(',')}`)
}

// ── T2 secureRekey.service ────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT2 — services/secureRekey.service.ts')
const rpcCalls = []
let authed = true
const setCalls = []
const mem = {
  bbqone_local_folders: [{ id: 'lf', name: 'L', is_secure: true, secure_salt: 'OLD', pbkdf2_iterations: 310000, secure_verifier_enc: 'v', updated_at: T, __synced: true }],
  bbqone_local_notes: [{ id: 'ln1', folder_id: 'lf', title: 'old1', updated_at: T, __synced: true }, { id: 'ln2', folder_id: 'lf', title: 'old2', updated_at: T, __synced: true }, { id: 'other', folder_id: 'x', title: 'keep', updated_at: T }],
  bbqone_local_note_bodies: [{ id: 'lb1', note_id: 'ln1', label: 'l', content: 'c', updated_at: T }],
}
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        const ks = Array.isArray(keys) ? keys : [keys]
        return Object.fromEntries(ks.map((k) => [k, JSON.parse(JSON.stringify(mem[k] ?? null))]))
      },
      async set(o) {
        setCalls.push(Object.keys(o).sort().join('+'))
        Object.assign(mem, JSON.parse(JSON.stringify(o)))
      },
    },
  },
}
const SVC = tryLoad('src/services/secureRekey.service.ts', {
  './supabase': { supabase: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { folder: { id: args.p_folder_id, secure_salt: args.p_salt }, notes: [], bodies: [] }, error: null } } } },
  '@/services/supabase': { supabase: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { folder: { id: args.p_folder_id, secure_salt: args.p_salt }, notes: [], bodies: [] }, error: null } } } },
  '@/services/localFirst/authMode': { isAuthenticated: async () => authed },
  '@/types/localFirst': { LOCAL_STORAGE_KEYS: { folders: 'bbqone_local_folders', notes: 'bbqone_local_notes', noteBodies: 'bbqone_local_note_bodies' } },
})
const svc = SVC.secureRekeyService
if (!svc) {
  check('SEC13.6 secureRekey.service load được', false, SVC.__error)
} else {
  const payload = (over = {}) => ({ folderId: 'lf', expectedSalt: 'OLD', secure: { salt: 'NEW', iterations: 600000, verifier: 'v2' }, notes: [{ id: 'ln1', title: 'new1' }, { id: 'ln2', title: 'new2' }], bodies: [{ id: 'lb1', label: 'L2', content: 'C2' }], ...over })
  authed = true
  await svc.apply(payload())
  const a = rpcCalls[0]?.args ?? {}
  check('SEC13.6 đã đăng nhập: gọi RPC bbq_rekey_secure_folder với p_folder_id / p_expected_salt / p_salt / p_iterations / p_verifier / p_notes / p_bodies',
    rpcCalls[0]?.name === 'bbq_rekey_secure_folder' && a.p_folder_id === 'lf' && a.p_expected_salt === 'OLD' && a.p_salt === 'NEW' && a.p_iterations === 600000 &&
      a.p_verifier === 'v2' && Array.isArray(a.p_notes) && a.p_notes.length === 2 && Array.isArray(a.p_bodies),
    JSON.stringify(rpcCalls[0]))

  authed = false
  setCalls.length = 0
  const stale = await errMsg(() => svc.apply(payload({ expectedSalt: 'WRONG' })))
  const missing = await errMsg(() => svc.apply(payload({ notes: [{ id: 'ln1', title: 'new1' }] })))
  const writesBad = setCalls.length
  const okLocal = await errMsg(() => svc.apply(payload()))
  check('SEC13.7 chưa đăng nhập: salt lệch / thiếu ghi chú → lỗi, KHÔNG ghi; hợp lệ → đúng MỘT chrome.storage.local.set gồm cả 3 khóa',
    stale !== null && missing !== null && writesBad === 0 && okLocal === null && setCalls.length === 1 &&
      setCalls[0] === 'bbqone_local_folders+bbqone_local_note_bodies+bbqone_local_notes' &&
      mem.bbqone_local_folders[0].secure_salt === 'NEW' && mem.bbqone_local_notes.find((n) => n.id === 'ln2').title === 'new2' &&
      mem.bbqone_local_notes.find((n) => n.id === 'other').title === 'keep' && mem.bbqone_local_note_bodies[0].content === 'C2',
    `stale=${stale} missing=${missing} writesBad=${writesBad} ok=${okLocal} sets=${setCalls.join(' / ')}`)
}

// ── T3 migration 020 ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT3 — supabase/migrations/020_secure_folder_rekey.sql')
const mig = read('supabase', 'migrations', '020_secure_folder_rekey.sql')
const parts = {
  fn: /create or replace function public\.bbq_rekey_secure_folder\(/i.test(mig),
  invoker: /security invoker/i.test(mig) && !/security definer/i.test(mig),
  searchPath: /set search_path = ''/i.test(mig),
  lock: /for update/i.test(mig),
  stale: /secure_salt is distinct from p_expected_salt/i.test(mig),
  incompleteNotes: /BBQ_REKEY_INCOMPLETE/.test(mig) && /public\.notes/.test(mig) && /public\.note_bodies/.test(mig),
  iterations: /p_iterations < 100000/.test(mig) && /p_iterations > 5000000/.test(mig),
  synced: (mig.match(/synced_at = now\(\)/g) || []).length >= 2,
  grants: /revoke all on function public\.bbq_rekey_secure_folder[\s\S]*?from public/i.test(mig) && /from anon/i.test(mig) && /grant execute on function public\.bbq_rekey_secure_folder[\s\S]*?to authenticated/i.test(mig),
  noAuthSchema: !/auth\.(users|mfa_factors|sessions)/i.test(mig.replace(/--.*$/gm, '')),
}
const bad = Object.entries(parts).filter(([, v]) => !v).map(([k]) => k)
check('SEC13.8 RPC một giao dịch: SECURITY INVOKER (RLS + aal2 vẫn áp), search_path rỗng, khóa dòng thư mục (for update), từ chối salt lệch / thiếu ghi chú hoặc section, số vòng 100k–5M, synced_at = now() (dòng sạch), chỉ authenticated gọi, không đọc schema auth',
  mig !== '' && bad.length === 0, mig ? `thiếu: ${bad.join(', ')}` : 'chưa có file')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/SEC13-atomic-rekey.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. SEC-13 đúng spec.')
