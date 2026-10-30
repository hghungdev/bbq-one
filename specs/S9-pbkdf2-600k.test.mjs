/**
 * FAILING TEST — S9 (SEC-9): thư mục bảo mật — (1) chốt salt: máy khác đổi mật khẩu (salt mới) thì khóa cũ trong RAM
 * KHÔNG được dùng để ghi / giải mã nữa (trước: máy B ghi bằng khóa cũ → ghi chú không mở được bằng mật khẩu mới = mất dữ
 * liệu); (2) PBKDF2 600.000 vòng cho thư mục mới / đổi mật khẩu, thư mục cũ 310.000 vẫn mở; (3) nâng cấp do người dùng
 * bấm (giữ mật khẩu cũ); (4) mật khẩu mới ≥ 10 ký tự, chặn mật khẩu phổ biến.
 *
 * Chạy:   node specs/S9-pbkdf2-600k.test.mjs
 * GREEN sau khi áp specs/S9-pbkdf2-600k.spec.md.
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

// ── T1 hằng số + độ mạnh mật khẩu ─────────────────────────────────────────────────────────────────────────────────
console.log('T1 — PBKDF2 mặc định, độ mạnh mật khẩu')
const C = loadTs('src/utils/secureCrypto.ts')
check('S9.1 DEFAULT_PBKDF2_ITERATIONS = 600.000 (OWASP 2023 cho PBKDF2-SHA256)', C.DEFAULT_PBKDF2_ITERATIONS === 600_000, String(C.DEFAULT_PBKDF2_ITERATIONS))
const PW = tryLoad('src/utils/passwordStrength.ts')
const issue = typeof PW.secureFolderPasswordIssue === 'function' ? PW.secureFolderPasswordIssue : null
const cases = [
  ['', 'tooShort'], ['abc12345', 'tooShort'], ['abcde1234', 'tooShort'],
  ['password123', 'common'], ['Password123!', 'common'], ['1234567890', 'common'], ['matkhau123', 'common'],
  ['qwertyuiop', 'common'], ['iloveyou12', 'common'], ['0101199000', 'common'], ['aaaaaaaaaaaa', 'common'],
  ['Correct-Horse-9', null], ['bbq notes 2026 tim', null], ['Nhà-tôi-ở-HN-7', null],
]
const wrong = issue ? cases.filter(([p, want]) => issue(p) !== want).map(([p, want]) => `${JSON.stringify(p)}→${issue(p)} (cần ${want})`) : ['chưa có']
check('S9.7a secureFolderPasswordIssue: < 10 ký tự → tooShort; phổ biến / lặp / dãy số / ngày sinh → common; còn lại → null',
  !PW.__error && wrong.length === 0 && PW.SECURE_FOLDER_MIN_PASSWORD === 10, PW.__error || wrong.join(', '))

// ── T2 store thật (2 "máy" = sửa thư mục trong folders store như khi đồng bộ về) ─────────────────────────────────
console.log('\nT2 — stores/secureFolder.ts (CODE THẬT + WebCrypto thật)')
const folderUpdates = []
const noteUpdates = []
const foldersState = vue.reactive({
  folders: [],
  loadAllCalls: 0,
  reorderFoldersByUpdated() {},
  async persistCache() {},
  async loadAll() {
    this.loadAllCalls++
  },
})
/** chrome.storage.onChanged giả — ngữ cảnh khác (tab / popup / SW đồng bộ về) ghi danh sách thư mục. */
const storageListeners = []
globalThis.chrome = { storage: { onChanged: { addListener: (fn) => storageListeners.push(fn) } } }
/** Như store thật: nạp lại = giải mã đè (S1) cho thư mục đang mở → RAM giữ BẢN RÕ khi thư mục mở. */
let storeRef = null
const notesState = vue.reactive({
  notes: [],
  bodies: [],
  loadAllCalls: 0,
  persistCalls: 0,
  bodiesForNote(id) {
    return this.bodies.filter((b) => b.note_id === id)
  },
  async loadAll() {
    this.loadAllCalls++
    if (storeRef) await storeRef.decryptLoadedSecureRows()
  },
  async persistCache() {
    this.persistCalls++
  },
})
const mocks = {
  pinia,
  vue,
  '@/services/folders.service': {
    foldersService: {
      update: async (id, patch) => {
        folderUpdates.push({ id, ...patch })
        const f = foldersState.folders.find((x) => x.id === id)
        const row = { ...f, ...patch, updated_at: new Date().toISOString() }
        // Như bản thật (local-first): ghi kho TRƯỚC khi trả về → chính ngữ cảnh này nhận onChanged lúc chưa setKey.
        const rows = foldersState.folders.map((x) => (x.id === id ? row : x))
        for (const fn of storageListeners) fn({ bbqone_local_folders: { newValue: rows } }, 'local')
        return row
      },
    },
  },
  '@/services/notes.service': { notesService: { update: async (id, p) => { noteUpdates.push({ id, ...p }); return { id, ...p } } } },
  '@/services/noteBodies.service': { noteBodiesService: { update: async (id, p) => ({ id, ...p }) } },
  '@/stores/folders': { useFoldersStore: () => foldersState },
  '@/stores/notes': { useNotesStore: () => notesState },
  '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
  '@/utils/secureCrypto': C,
  '@/utils/passwordStrength': PW,
  // SEC-13 (2.3.1): đổi khóa đi qua MỘT lần secureRekeyService.apply — mock ghi vào CÙNG folderUpdates / noteUpdates và phát
  // onChanged như local-first (chỉ vá mock, không đổi assertion).
  '@/services/secureRekey.service': {
    secureRekeyService: {
      async apply(p) {
        const f = foldersState.folders.find((x) => x.id === p.folderId)
        const row = { ...f, is_secure: true, secure_salt: p.secure.salt, pbkdf2_iterations: p.secure.iterations, secure_verifier_enc: p.secure.verifier, updated_at: new Date().toISOString() }
        folderUpdates.push({ id: p.folderId, is_secure: true, secure_salt: p.secure.salt, pbkdf2_iterations: p.secure.iterations, secure_verifier_enc: p.secure.verifier })
        for (const n of p.notes) noteUpdates.push({ id: n.id, title: n.title })
        const rows = foldersState.folders.map((x) => (x.id === p.folderId ? row : x))
        for (const fn of storageListeners) fn({ bbqone_local_folders: { newValue: rows } }, 'local')
        const now = new Date().toISOString()
        return { folder: row, notes: p.notes.map((n) => ({ id: n.id, updated_at: now, synced_at: now })), bodies: p.bodies.map((b) => ({ id: b.id, updated_at: now, synced_at: now })) }
      },
    },
  },
  '@/constants/storage': { FOLDERS_CACHE_KEY: 'folders_cache' },
  '@/types/localFirst': { LOCAL_STORAGE_KEYS: { folders: 'bbqone_local_folders' } },
}
const storeMod = tryLoad('src/stores/secureFolder.ts', mocks)
const T = '2026-10-30T00:00:00.000Z'
async function secureFolder(id, password, iterations) {
  const salt = C.generateSalt16()
  const key = await C.deriveKeyFromPassword(password, salt, iterations)
  return {
    folder: { id, user_id: 'u', name: id, position: 0, created_at: T, updated_at: T, is_secure: true, secure_salt: C.saltToBase64(salt), pbkdf2_iterations: iterations, secure_verifier_enc: await C.encryptField(C.SECURE_VERIFIER_PLAINTEXT, key) },
    key,
  }
}
if (!storeMod.useSecureFolderStore) {
  check('S9.0 store secureFolder load được', false, storeMod.__error)
} else {
  pinia.setActivePinia(pinia.createPinia())
  const S = storeMod.useSecureFolderStore()
  storeRef = S
  /** true / false; 'n/a' khi store chưa có saltChangedIds (Set) — tránh !undefined thành true. */
  const sc = (id) => (S.saltChangedIds instanceof Set ? S.saltChangedIds.has(id) : 'n/a')

  // S9.2 thư mục cũ 310.000 vòng vẫn mở được
  const f1 = await secureFolder('f1', 'old-device-pw', 310_000)
  foldersState.folders = [f1.folder]
  notesState.notes = [{ id: 'n1', folder_id: 'f1', title: await C.encryptField('Kế hoạch', f1.key) }]
  notesState.bodies = [{ id: 'b1', note_id: 'n1', label: await C.encryptField('', f1.key), content: await C.encryptField('<p>x</p>', f1.key) }]
  const unlockErr = await errMsg(() => S.unlockFolder('f1', 'old-device-pw'))
  check('S9.2 thư mục 310.000 vòng (tạo trước 2.2.0) mở bằng đúng số vòng của nó',
    unlockErr === null && S.getKey('f1') !== null && S.isFolderLocked('f1') === false, unlockErr ?? 'getKey null')

  // S9.4 máy khác đổi mật khẩu → folders store nhận salt mới khi đồng bộ về
  const fOther = await secureFolder('f1', 'new-pw-from-device-A', 600_000)
  const loadsBefore = notesState.loadAllCalls
  foldersState.folders = [{ ...fOther.folder }]
  const syncGetKey = S.getKey('f1')
  const syncLocked = S.isFolderLocked('f1')
  notesState.notes = [{ id: 'n1', folder_id: 'f1', title: await C.encryptField('Kế hoạch', fOther.key) }]
  const decErr = await errMsg(() => S.decryptLoadedSecureRows())
  check('S9.4a salt lệch → getKey = null NGAY (mọi đường ghi đều từ chối "Folder locked"), thư mục hiện là đã khóa',
    syncGetKey === null && syncLocked === true, `getKey=${syncGetKey ? 'CÒN KHÓA CŨ' : 'null'} locked=${syncLocked}`)
  check('S9.4b decryptLoadedSecureRows không thử giải mã bằng khóa cũ (không lỗi, bản mã giữ nguyên)',
    decErr === null && C.isEncryptedEnvelope(notesState.notes[0].title), decErr ?? 'tiêu đề bị đổi')
  await vue.nextTick()
  await new Promise((r) => setTimeout(r, 0))
  check('S9.4c sau đó: khóa cũ bị quên, đánh dấu "đổi ở máy khác" (hộp mở khóa báo), nạp lại ghi chú như khi khóa tay',
    !S.sessionKeys.has('f1') && sc('f1') === true && notesState.loadAllCalls > loadsBefore,
    `còn key=${S.sessionKeys.has('f1')} saltChanged=${sc('f1')} loadAll +${notesState.loadAllCalls - loadsBefore}`)
  const reErr = await errMsg(() => S.unlockFolder('f1', 'new-pw-from-device-A'))
  check('S9.4d mở khóa lại bằng mật khẩu mới → dùng được, bỏ đánh dấu',
    reErr === null && S.getKey('f1') !== null && sc('f1') === false, reErr ?? 'không mở được')

  // S9.4e cùng máy, tab khác đổi mật khẩu: tab này không tự nạp lại thư mục → nghe kho, salt khác khóa đang giữ → nạp lại
  const fsBefore = foldersState.loadAllCalls
  const fNewer = await secureFolder('f1', 'third-pw-other-tab', 600_000)
  for (const fn of storageListeners) fn({ folders_cache: { newValue: [fNewer.folder] } }, 'local')
  const reloadOnStale = foldersState.loadAllCalls - fsBefore
  const fsBefore2 = foldersState.loadAllCalls
  for (const fn of storageListeners) fn({ folders_cache: { newValue: [{ ...foldersState.folders[0] }] } }, 'local')
  for (const fn of storageListeners) fn({ bbqone_local_folders: { newValue: [{ ...foldersState.folders[0] }] } }, 'local')
  check('S9.4e kho thư mục (cache / local-first) đổi ở ngữ cảnh khác với salt lệch khóa đang giữ → nạp lại thư mục (watcher quên khóa); salt khớp → không nạp',
    storageListeners.length > 0 && reloadOnStale === 1 && foldersState.loadAllCalls === fsBefore2,
    `listeners=${storageListeners.length} lệch→+${reloadOnStale} khớp→+${foldersState.loadAllCalls - fsBefore2}`)

  // S9.3 tạo thư mục bảo mật mới → 600.000 vòng
  foldersState.folders = [...foldersState.folders, { id: 'f2', user_id: 'u', name: 'f2', position: 1, created_at: T, updated_at: T, is_secure: false, secure_salt: null, pbkdf2_iterations: 310_000, secure_verifier_enc: null }]
  notesState.notes = []
  notesState.bodies = []
  folderUpdates.length = 0
  const enErr = await errMsg(() => S.enableSecureFolder('f2', 'Correct-Horse-9', 'Correct-Horse-9'))
  const enUpd = folderUpdates.find((u) => u.id === 'f2')
  const iF2 = foldersState.folders.findIndex((f) => f.id === 'f2')
  if (enUpd && iF2 >= 0) foldersState.folders[iF2] = { ...foldersState.folders[iF2], ...enUpd }
  await vue.nextTick()
  check('S9.3a bật bảo mật → pbkdf2_iterations 600.000; khóa dùng được ngay, KHÔNG báo nhầm "đổi ở máy khác"',
    enErr === null && enUpd?.pbkdf2_iterations === 600_000 && S.getKey('f2') !== null && sc('f2') === false,
    enErr ?? JSON.stringify(enUpd))

  // S9.5 tự đổi mật khẩu trên máy này → 600.000, không báo nhầm. Thư mục ĐANG MỞ: RAM là bản rõ (trước S9 luôn báo
  // "Current passphrase is wrong" vì giải mã bản rõ).
  const f3 = await secureFolder('f3', 'Old-Strong-pw-1', 310_000)
  foldersState.folders = [...foldersState.folders, f3.folder]
  notesState.notes = [{ id: 'n3', folder_id: 'f3', title: await C.encryptField('A', f3.key) }]
  notesState.bodies = [{ id: 'b3', note_id: 'n3', label: await C.encryptField('', f3.key), content: await C.encryptField('<p>a</p>', f3.key) }]
  await S.unlockFolder('f3', 'Old-Strong-pw-1')
  const ramPlainBefore = notesState.notes.find((n) => n.id === 'n3')?.title
  folderUpdates.length = 0
  noteUpdates.length = 0
  const wrongOld = await errMsg(() => S.changePassphrase('f3', 'not-the-old-pw', 'New-Strong-pw-2', 'New-Strong-pw-2'))
  const fsBeforeChange = foldersState.loadAllCalls
  const writesWrong = folderUpdates.length + noteUpdates.length
  const chErr = await errMsg(() => S.changePassphrase('f3', 'Old-Strong-pw-1', 'New-Strong-pw-2', 'New-Strong-pw-2'))
  await vue.nextTick()
  await new Promise((r) => setTimeout(r, 0))
  const chUpd = folderUpdates.find((u) => u.id === 'f3')
  const selfReloads = foldersState.loadAllCalls - fsBeforeChange
  let serverPlain = '(không đọc được)'
  try {
    const k = await C.deriveKeyFromPassword('New-Strong-pw-2', C.saltFromBase64(chUpd.secure_salt), 600_000)
    serverPlain = await C.decryptField(noteUpdates.find((u) => u.id === 'n3').title, k)
  } catch {}
  check('S9.5 đổi mật khẩu khi thư mục ĐANG MỞ (RAM bản rõ): sai mật khẩu cũ → lỗi, 0 ghi; đúng → bản ghi lên máy chủ mở được bằng mật khẩu mới, RAM vẫn là bản rõ, cache được ghi lại',
    ramPlainBefore === 'A' && wrongOld !== null && writesWrong === 0 && chErr === null && serverPlain === 'A' &&
      notesState.notes.find((n) => n.id === 'n3')?.title === 'A' && notesState.persistCalls > 0,
    `ramBefore=${ramPlainBefore} wrongOld=${wrongOld} writesWrong=${writesWrong} err=${chErr} server=${serverPlain} ram=${notesState.notes.find((n) => n.id === 'n3')?.title}`)
  check('S9.3b đổi mật khẩu → 600.000 vòng; ngay sau đó khóa mới dùng được, không bị chốt salt khóa nhầm (kể cả khi chính lần ghi này phát onChanged trước setKey → không nạp lại thư mục)',
    selfReloads === 0 && chErr === null && chUpd?.pbkdf2_iterations === 600_000 && S.getKey('f3') !== null && sc('f3') === false && S.isFolderLocked('f3') === false,
    chErr ?? `selfReloads=${selfReloads} upd=${JSON.stringify(chUpd)} getKey=${S.getKey('f3') ? 'ok' : 'null'} saltChanged=${sc('f3')}`)

  // S9.6 nâng cấp do người dùng bấm: giữ mật khẩu cũ (kể cả < 10 ký tự), sai mật khẩu → không ghi gì
  const f4 = await secureFolder('f4', 'abcd1234', 310_000)
  foldersState.folders = [...foldersState.folders, f4.folder]
  notesState.notes = [{ id: 'n4', folder_id: 'f4', title: await C.encryptField('B', f4.key) }]
  notesState.bodies = [{ id: 'b4', note_id: 'n4', label: await C.encryptField('', f4.key), content: await C.encryptField('<p>b</p>', f4.key) }]
  await S.unlockFolder('f4', 'abcd1234')
  folderUpdates.length = 0
  const badUp = typeof S.upgradeIterations === 'function' ? await errMsg(() => S.upgradeIterations('f4', 'wrong-pass')) : 'chưa có upgradeIterations'
  const writesAfterBad = folderUpdates.length + noteUpdates.filter((u) => u.id === 'n4').length
  const upErr = typeof S.upgradeIterations === 'function' ? await errMsg(() => S.upgradeIterations('f4', 'abcd1234')) : 'chưa có upgradeIterations'
  const upUpd = folderUpdates.find((u) => u.id === 'f4')
  check('S9.6 upgradeIterations: sai mật khẩu → lỗi, không ghi; đúng mật khẩu cũ (8 ký tự) → 600.000 vòng, salt mới, khóa dùng được',
    badUp !== null && writesAfterBad === 0 && upErr === null && upUpd?.pbkdf2_iterations === 600_000 && upUpd.secure_salt !== f4.folder.secure_salt && S.getKey('f4') !== null,
    `bad=${badUp} writesAfterBad=${writesAfterBad} ok=${upErr} upd=${JSON.stringify(upUpd)}`)

  // S9.5c thư mục cũ KHÔNG có verifier, đang mở (RAM bản rõ): mật khẩu cũ sai vẫn phải bị từ chối
  const salt6 = C.generateSalt16()
  const key6 = await C.deriveKeyFromPassword('legacy-pass-77', salt6, 310_000)
  foldersState.folders = [...foldersState.folders, { id: 'f6', user_id: 'u', name: 'f6', position: 3, created_at: T, updated_at: T, is_secure: true, secure_salt: C.saltToBase64(salt6), pbkdf2_iterations: 310_000, secure_verifier_enc: null }]
  notesState.notes = [{ id: 'n6', folder_id: 'f6', title: await C.encryptField('C', key6) }]
  notesState.bodies = [{ id: 'b6', note_id: 'n6', label: await C.encryptField('', key6), content: await C.encryptField('<p>c</p>', key6) }]
  await S.unlockFolder('f6', 'legacy-pass-77')
  folderUpdates.length = 0
  noteUpdates.length = 0
  const legacyWrong = await errMsg(() => S.changePassphrase('f6', 'guess-pass-00', 'Another-Strong-1', 'Another-Strong-1'))
  const legacyWrites = folderUpdates.length + noteUpdates.length
  const legacyOk = await errMsg(() => S.changePassphrase('f6', 'legacy-pass-77', 'Another-Strong-1', 'Another-Strong-1'))
  check('S9.5c thư mục cũ không verifier, đang mở: mật khẩu cũ sai → lỗi, 0 ghi (so khóa dẫn ra với khóa phiên); đúng → đổi được',
    notesState.notes.find((n) => n.id === 'n6')?.title === 'C' && legacyWrong !== null && legacyWrites === 0 && legacyOk === null,
    `ram=${notesState.notes.find((n) => n.id === 'n6')?.title} wrong=${legacyWrong} writes=${legacyWrites} ok=${legacyOk}`)

  // S9.7 mật khẩu yếu khi tạo / đổi → lỗi i18n, không ghi
  foldersState.folders = [...foldersState.folders, { id: 'f5', user_id: 'u', name: 'f5', position: 2, created_at: T, updated_at: T, is_secure: false, secure_salt: null, pbkdf2_iterations: 310_000, secure_verifier_enc: null }]
  folderUpdates.length = 0
  const e1 = await errMsg(() => S.enableSecureFolder('f5', 'short', 'short'))
  const e2 = await errMsg(() => S.enableSecureFolder('f5', 'password123', 'password123'))
  const e3 = await errMsg(() => S.changePassphrase('f3', 'New-Strong-pw-2', '1234567890', '1234567890'))
  check('S9.7b tạo / đổi bằng mật khẩu yếu → secureFolder.err.tooShort / secureFolder.err.common, không ghi gì',
    String(e1).includes('secureFolder.err.tooShort') && String(e2).includes('secureFolder.err.common') && String(e3).includes('secureFolder.err.common') && folderUpdates.length === 0,
    `e1=${e1} e2=${e2} e3=${e3} writes=${folderUpdates.length}`)
}

// ── T3 giao diện + i18n + B1 ───────────────────────────────────────────────────────────────────────────────────────
console.log('\nT3 — giao diện, i18n, file sao lưu')
const modal = read('src', 'components', 'folders', 'SecureFolderModal.vue')
check("S9.8 SecureFolderModal: chế độ 'upgrade' gọi upgradeIterations; mở khóa báo secureFolder.saltChanged khi bị đổi ở máy khác; nút hiện secureFolder.unlocking khi đang chạy; gợi ý độ mạnh khi tạo / đổi",
  /mode: 'enable' \| 'unlock' \| 'change' \| 'upgrade'/.test(modal) && /secure\.upgradeIterations\(props\.folderId, password\.value\)/.test(modal) &&
    /secure\.saltChangedIds\.has\(folderId\)/.test(modal) && /t\('secureFolder\.saltChanged'\)/.test(modal) && /t\('secureFolder\.unlocking'\)/.test(modal) &&
    /t\('secureFolder\.strengthHint'\)/.test(modal),
  'SecureFolderModal.vue')
const list = read('src', 'components', 'layout', 'NoteList.vue')
check('S9.9 NoteList: thư mục đang mở mà pbkdf2_iterations < DEFAULT → dải "mức bảo vệ cũ" + nút Nâng cấp (mở hộp chế độ upgrade)',
  /pbkdf2_iterations < DEFAULT_PBKDF2_ITERATIONS/.test(list) && /!folderLocked\.value/.test(list) && /t\('secureFolder\.upgradeHint'\)/.test(list) &&
    /mode="upgrade"/.test(list),
  'NoteList.vue')
const KEYS = ['secureFolder.err.tooShort', 'secureFolder.err.common', 'secureFolder.saltChanged', 'secureFolder.titleUpgrade', 'secureFolder.upgradeHint',
  'secureFolder.upgradeBtn', 'secureFolder.upgradeDesc', 'secureFolder.unlocking', 'secureFolder.strengthHint']
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const missing = KEYS.flatMap((k) => [[vi, 'vi'], [en, 'en']].filter(([f]) => !f.includes(`'${k}'`)).map(([, l]) => `${l}:${k}`))
check('S9.10 i18n vi + en đủ khóa', missing.length === 0, `thiếu: ${missing.join(', ')}`)
const b1 = read('src', 'utils', 'backupFile.ts')
const max = Number(((b1.match(/const PBKDF2_MAX = ([\d_]+)/) || [])[1] || '0').replace(/_/g, ''))
check('S9.11 file sao lưu (B1) nhận thư mục 600.000 vòng (PBKDF2_MAX ≥ 600.000)', max >= 600_000, `PBKDF2_MAX=${max}`)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S9-pbkdf2-600k.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S9 đúng spec.')
