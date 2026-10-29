/**
 * FAILING TEST — B1: sao lưu ra file JSON (tự động khi mở + bằng tay) và khôi phục "thay toàn bộ" — không đăng nhập.
 *
 * Chạy:   node specs/B1-backup-file.test.mjs
 * GREEN sau khi áp specs/B1-backup-file.spec.md.
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
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}
function load(rel, mocks = {}) {
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

const CAL = load('src/constants/calendar.ts')
const STORAGE = load('src/constants/storage.ts')
const LOCAL = load('src/types/localFirst.ts')

let B = null
try {
  B = load('src/utils/backupFile.ts', { '@/constants/calendar': CAL, '@/constants/storage': STORAGE, '@/types/localFirst': LOCAL })
} catch (e) {
  check('B1.0 src/utils/backupFile.ts tồn tại', false, e.message)
}

const T = '2026-10-29T03:15:00.000Z'
const folder = (id, extra = {}) => ({ id, name: `F ${id}`, position: 0, is_secure: false, secure_salt: null, pbkdf2_iterations: 310000, secure_verifier_enc: null, created_at: T, updated_at: T, __synced: false, ...extra })
const note = (id, folder_id = 'f1', extra = {}) => ({ id, folder_id, title: `N ${id}`, tags: [], created_at: T, updated_at: T, synced_at: null, __synced: false, ...extra })
const body = (id, note_id, extra = {}) => ({ id, note_id, label: '', content: '<p>x</p>', position: 0, created_at: T, updated_at: T, synced_at: null, __synced: false, ...extra })
const ev = (id, event_date = '2026-10-29', position = 0, extra = {}) => ({ id, event_date, title: `E ${id}`, description: '', is_done: false, position, color: null, start_time: null, end_time: null, created_at: T, updated_at: T, synced_at: null, __synced: false, ...extra })
const bk = (id, tree, extra = {}) => ({ id, label: `bk ${id}`, tree_json: tree, browser_hint: 'chrome', created_at: T, encrypted: false, __synced: false, ...extra })
const tree = [{ id: '0', title: '', children: [{ id: '1', title: 'Bookmarks bar', children: [
  { id: '2', title: 'Good', url: 'https://ex.com/a' },
  { id: '3', title: 'Evil', url: 'javascript:alert(1)' },
  { id: '4', title: 'Data', url: 'data:text/html,<b>x</b>' },
  { id: '5', title: 'File', url: 'file:///C:/x.txt' },
] }] }]
const DATA = {
  folders: [folder('f1'), folder('fs', { is_secure: true, secure_salt: 'c2FsdA==', secure_verifier_enc: 'retronote:1:vvv' })],
  notes: [note('n1'), note('n2', 'fs', { title: 'retronote:1:ttt' })],
  note_bodies: [body('b1', 'n1'), body('b2', 'n2', { content: 'retronote:1:ccc' })],
  calendar_events: [ev('e1', '2026-10-29', 0, { series_id: 's1' })],
  bookmark_backups: [bk('k1', [{ id: '0', title: '', children: [{ id: '2', title: 'Good', url: 'https://ex.com/a' }] }])],
}

if (B) {
  console.log('T1 — tạo file')
  const now = new Date(2026, 9, 29, 10, 15) // 29/10/2026 10:15 giờ máy (thứ Năm)
  const file = B.buildBackup?.(DATA, { appVersion: '2.1.0', now })
  check(
    'B1.1 buildBackup: app / format 1 / exported_at / app_version / counts; bỏ __synced + user_id',
    file?.app === 'bbqone' && file.format === 1 && file.exported_at === now.toISOString() && file.app_version === '2.1.0' &&
      JSON.stringify(file.counts) === JSON.stringify({ folders: 2, notes: 2, note_bodies: 2, calendar_events: 1, bookmark_backups: 1 }) &&
      !JSON.stringify(file.data).includes('__synced') && !JSON.stringify(file.data).includes('user_id'),
    JSON.stringify(file?.counts),
  )
  check(
    'B1.2 thư mục bảo mật giữ muối + bộ kiểm; ghi chú bảo mật giữ nguyên mã hóa; series_id giữ',
    file?.data.folders[1].secure_salt === 'c2FsdA==' && file.data.folders[1].secure_verifier_enc === 'retronote:1:vvv' &&
      file.data.notes[1].title === 'retronote:1:ttt' && file.data.note_bodies[1].content === 'retronote:1:ccc' &&
      file.data.calendar_events[0].series_id === 's1',
    JSON.stringify(file?.data.folders[1]),
  )
  check(
    'B1.3 tên file: tay bbqone-backup-2026-10-29-1015.json · tự động BBQOne/bbqone-auto-thu.json · trước khôi phục bbqone-before-restore-…',
    B.backupFileName?.('manual', now) === 'bbqone-backup-2026-10-29-1015.json' &&
      B.backupFileName?.('auto', now) === 'BBQOne/bbqone-auto-thu.json' &&
      B.backupFileName?.('before-restore', now) === 'bbqone-before-restore-2026-10-29-1015.json' &&
      B.backupFileName?.('auto', new Date(2026, 10, 2)) === 'BBQOne/bbqone-auto-mon.json',
    `${B.backupFileName?.('manual', now)} / ${B.backupFileName?.('auto', now)}`,
  )

  console.log('\nT2 — đọc + kiểm file (dữ liệu ngoài, không tin cậy)')
  const text = B.serializeBackup?.(file) ?? ''
  const ok = B.parseBackup?.(text)
  check(
    'B1.4 file vừa tạo → đọc lại y nguyên dữ liệu (vòng tròn)',
    ok?.ok === true && JSON.stringify(ok.file.data) === JSON.stringify(file.data),
    JSON.stringify(ok?.error ?? ok?.dropped),
  )
  const err = (t) => B.parseBackup?.(t)
  check(
    'B1.5 lỗi: không phải JSON / app khác / thiếu data / format mới hơn / quá 50 MB',
    err('{oops')?.error === 'not_json' && err(JSON.stringify({ app: 'x', format: 1, data: {} }))?.error === 'not_bbqone' &&
      err(JSON.stringify({ app: 'bbqone', format: 1 }))?.error === 'invalid' &&
      err(JSON.stringify({ app: 'bbqone', format: 2, data: {} }))?.error === 'newer_format' &&
      B.BACKUP_MAX_BYTES === 50 * 1024 * 1024 && err('x'.repeat(10))?.ok === false &&
      B.parseBackup?.(' '.repeat(B.BACKUP_MAX_BYTES + 1))?.error === 'too_large',
    [err('{oops')?.error, err(JSON.stringify({ app: 'x', format: 1, data: {} }))?.error, err(JSON.stringify({ app: 'bbqone', format: 2, data: {} }))?.error].join(','),
  )
  const dirty = {
    app: 'bbqone', format: 1, exported_at: T, app_version: '9.9.9', counts: {},
    data: {
      folders: [folder('f1', { evil: '<script>' }), folder('f1'), { id: 5, name: 'bad' }],
      notes: [note('n1'), note('n3', 'gone'), { id: 'x', title: 7 }],
      note_bodies: [body('b1', 'n1'), body('b9', 'nope')],
      calendar_events: [
        ...Array.from({ length: 7 }, (_, i) => ev(`c${i}`, '2026-11-01', 6 - i)),
        ev('long', '2026-11-02', 0, { title: 'x'.repeat(CAL.CALENDAR_TITLE_MAX + 1) }),
        ev('baddate', '01/11/2026'),
      ],
      bookmark_backups: [bk('k1', tree), bk('k2', 'not-array')],
    },
  }
  const p = B.parseBackup?.(JSON.stringify(dirty))
  const d = p?.file?.data
  check(
    'B1.6 bỏ trường lạ; dòng sai kiểu / trùng id → bỏ + đếm',
    p?.ok === true && d.folders.length === 1 && !('evil' in d.folders[0]) && d.notes.some((n) => n.id === 'n1') && !d.notes.some((n) => n.id === 'x') &&
      p.dropped.duplicate === 1 && p.dropped.invalid >= 3,
    JSON.stringify(p?.dropped),
  )
  check(
    'B1.7 section không có ghi chú → bỏ; ghi chú trỏ thư mục không có → "không thư mục"',
    d?.note_bodies.map((b) => b.id).join() === 'b1' && d.notes.find((n) => n.id === 'n3')?.folder_id === null && p.dropped.orphanBodies === 1,
    JSON.stringify(d?.note_bodies.map((b) => b.id)),
  )
  check(
    'B1.8 sự kiện: tối đa 6 / ngày (giữ theo position), tên > 64 / ngày sai dạng → bỏ',
    d?.calendar_events.filter((e) => e.event_date === '2026-11-01').length === CAL.CALENDAR_MAX_EVENTS_PER_DAY &&
      !d.calendar_events.some((e) => e.id === 'c0') && !d.calendar_events.some((e) => e.id === 'long' || e.id === 'baddate') && p.dropped.overCap === 1,
    JSON.stringify(d?.calendar_events.map((e) => e.id)),
  )
  const urls = JSON.stringify(d?.bookmark_backups?.[0]?.tree_json ?? [])
  check(
    'B1.9 bookmark: chỉ http(s) / ftp / file — javascript: và data: bị bỏ + đếm; tree_json sai kiểu → bỏ bản đó',
    urls.includes('https://ex.com/a') && urls.includes('file:///C:/x.txt') && !urls.includes('javascript:') && !urls.includes('data:text') &&
      p.dropped.unsafeBookmarks === 2 && d.bookmark_backups.length === 1,
    JSON.stringify(p?.dropped),
  )
  let deep = { id: 'leaf', title: 'leaf', url: 'https://deep.ex' }
  for (let i = 0; i < 200; i++) deep = { id: `d${i}`, title: '', children: [deep] }
  const deepRes = B.parseBackup?.(JSON.stringify({ ...dirty, data: { ...dirty.data, bookmark_backups: [bk('kd', [deep])] } }))
  check('B1.10 cây bookmark quá sâu (200 tầng) không làm sập — cắt ở 64 tầng', deepRes?.ok === true && !JSON.stringify(deepRes.file.data.bookmark_backups).includes('deep.ex'), String(deepRes?.ok))

  console.log('\nT3 — ghi khi khôi phục (thay toàn bộ)')
  const w = B.restoreWrites?.(file.data) ?? {}
  check(
    'B1.11 restoreWrites: bbqone_local_* (__synced false, synced_at null) + cache (user_id "") cho đủ 5 loại',
    w[LOCAL.LOCAL_STORAGE_KEYS.notes]?.[0]?.__synced === false && w[LOCAL.LOCAL_STORAGE_KEYS.notes][0].synced_at === null &&
      w[LOCAL.LOCAL_STORAGE_KEYS.folders]?.length === 2 && w[LOCAL.LOCAL_STORAGE_KEYS.noteBodies]?.length === 2 &&
      w[LOCAL.LOCAL_STORAGE_KEYS.calendarEvents]?.length === 1 && w[LOCAL.LOCAL_STORAGE_KEYS.bookmarks]?.length === 1 &&
      w[STORAGE.NOTES_CACHE_KEY]?.[0]?.user_id === '' && !('__synced' in w[STORAGE.NOTES_CACHE_KEY][0]) &&
      w[STORAGE.FOLDERS_CACHE_KEY]?.length === 2 && w[STORAGE.NOTE_BODIES_CACHE_KEY]?.length === 2 &&
      w[CAL.CALENDAR_EVENTS_CACHE_KEY]?.[0]?.user_id === '' && w[STORAGE.BOOKMARKS_CACHE_KEY]?.[0]?.user_id === '',
    Object.keys(w).join(','),
  )

  console.log('\nT4 — tự sao lưu: điều kiện rẻ trước, dấu nội dung sau')
  const due = (o) => B.shouldCheckAutoBackup?.({ enabled: true, signedIn: false, todayKey: '2026-10-29', lastCheckDay: null, ...o })
  check(
    'B1.12 shouldCheckAutoBackup: tắt / đã đăng nhập / hôm nay đã kiểm → không; còn lại → có',
    due({}) === true && due({ enabled: false }) === false && due({ signedIn: true }) === false && due({ lastCheckDay: '2026-10-29' }) === false &&
      due({ lastCheckDay: '2026-10-28' }) === true,
    [due({}), due({ enabled: false }), due({ signedIn: true }), due({ lastCheckDay: '2026-10-29' })].join(','),
  )
  const d1 = await B.backupDigest?.(file.data)
  const d2 = await B.backupDigest?.(JSON.parse(JSON.stringify(file.data)))
  const d3 = await B.backupDigest?.({ ...file.data, notes: [...file.data.notes, { ...file.data.notes[0], id: 'n9' }] })
  check('B1.13 backupDigest: SHA-256 hex, ổn định, đổi khi dữ liệu đổi', /^[0-9a-f]{64}$/.test(d1 ?? '') && d1 === d2 && d1 !== d3, `${d1} ${d3}`)
  check('B1.14 isBackupEmpty: không có dòng nào → true', B.isBackupEmpty?.({ folders: [], notes: [], note_bodies: [], calendar_events: [], bookmark_backups: [] }) === true && B.isBackupEmpty?.(file.data) === false, 'sai')
}

console.log('\nT5 — service (kho + tải file)')
const store = new Map()
const session = new Map([[STORAGE.BBQ_NOTE_DRAFT_SESSION_KEY, { x: 1 }]])
const downloads = []
let setCalls = 0
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => store.has(k)).map((k) => [k, structuredClone(store.get(k))])),
      set: async (obj) => { setCalls++; for (const [k, v] of Object.entries(obj)) store.set(k, structuredClone(v)) },
      remove: async (keys) => { for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k) },
    },
    session: { remove: async (keys) => { for (const k of Array.isArray(keys) ? keys : [keys]) session.delete(k) } },
  },
  downloads: { download: async (opts) => { downloads.push(opts); return downloads.length } },
  runtime: { getManifest: () => ({ version: '2.1.0' }) },
}
globalThis.URL.createObjectURL = () => 'blob:mock'
globalThis.URL.revokeObjectURL = () => {}
let S = null
try {
  S = load('src/services/backupFile.service.ts', {
    '@/utils/backupFile': B ?? {},
    '@/constants/storage': STORAGE,
    '@/constants/calendar': CAL,
    '@/types/localFirst': LOCAL,
  })
} catch (e) {
  check('B1.15 src/services/backupFile.service.ts tồn tại', false, e.message)
}
if (S && B) {
  for (const [k, v] of Object.entries({ folders: DATA.folders, notes: DATA.notes, noteBodies: DATA.note_bodies, calendarEvents: DATA.calendar_events, bookmarks: DATA.bookmark_backups })) store.set(LOCAL.LOCAL_STORAGE_KEYS[k], v)
  const snap = await S.readBackupData?.('local')
  check('B1.15 readBackupData("local") đọc đủ bbqone_local_*', snap?.notes?.length === 2 && snap.note_bodies.length === 2 && snap.bookmark_backups.length === 1, JSON.stringify(Object.keys(snap ?? {})))
  store.set(STORAGE.NOTES_CACHE_KEY, [{ ...DATA.notes[0], user_id: 'u1' }])
  const cacheSnap = await S.readBackupData?.('account-cache')
  check('B1.16 readBackupData("account-cache") (cờ người đăng nhập) đọc cache', cacheSnap?.notes?.length === 1 && cacheSnap.folders.length === 0, JSON.stringify(cacheSnap?.notes))

  const r1 = await S.maybeAutoBackup?.({ signedIn: false, now: new Date(2026, 9, 29, 9, 0) })
  const r2 = await S.maybeAutoBackup?.({ signedIn: false, now: new Date(2026, 9, 29, 18, 0) })
  const st = store.get(STORAGE.BBQ_BACKUP_STATE_KEY)
  check(
    'B1.17 tự sao lưu: lần đầu trong ngày → tải BBQOne/bbqone-auto-thu.json (ghi đè, không hỏi); lần 2 cùng ngày → bỏ qua',
    r1 === 'saved' && r2 === 'skipped' && downloads.length === 1 && downloads[0].filename === 'BBQOne/bbqone-auto-thu.json' &&
      downloads[0].conflictAction === 'overwrite' && downloads[0].saveAs === false && st?.lastCheckDay === '2026-10-29' && typeof st.lastBackupAt === 'string' &&
      /^[0-9a-f]{64}$/.test(st.lastBackupDigest ?? ''),
    `${r1} ${r2} ${JSON.stringify(downloads.map((x) => x.filename))}`,
  )
  const r3 = await S.maybeAutoBackup?.({ signedIn: false, now: new Date(2026, 9, 30, 9, 0) })
  check('B1.18 ngày mới nhưng dữ liệu không đổi → không tải, chỉ ghi "đã kiểm"', r3 === 'unchanged' && downloads.length === 1 && store.get(STORAGE.BBQ_BACKUP_STATE_KEY)?.lastCheckDay === '2026-10-30', String(r3))
  await S.writeBackupState?.({ autoEnabled: false })
  const r4 = await S.maybeAutoBackup?.({ signedIn: false, now: new Date(2026, 9, 31, 9, 0) })
  const r5 = await S.maybeAutoBackup?.({ signedIn: true, now: new Date(2026, 10, 1, 9, 0) })
  check('B1.19 công tắc tắt / đã đăng nhập → không tải', r4 === 'skipped' && r5 === 'skipped' && downloads.length === 1, `${r4} ${r5}`)
  const st0 = await S.readBackupState?.()
  check('B1.20 mặc định công tắc BẬT (chưa từng chỉnh)', (await (async () => { store.delete(STORAGE.BBQ_BACKUP_STATE_KEY); return (await S.readBackupState?.())?.autoEnabled })()) === true && st0?.autoEnabled === false, JSON.stringify(st0))

  const manual = await S.backupNow?.({ source: 'local', now: new Date(2026, 9, 29, 10, 15) })
  check('B1.21 backupNow → bbqone-backup-2026-10-29-1015.json, cập nhật lần sao lưu gần nhất', downloads.at(-1)?.filename === 'bbqone-backup-2026-10-29-1015.json' && typeof manual?.counts === 'object' && !!store.get(STORAGE.BBQ_BACKUP_STATE_KEY)?.lastBackupAt, JSON.stringify(downloads.at(-1)))

  store.set(STORAGE.BBQ_PENDING_DELETE_COMMITS_KEY, ['n1'])
  const before = setCalls
  const fileData = B.parseBackup(B.serializeBackup(B.buildBackup({ ...DATA, notes: [note('nz')], note_bodies: [] }, { appVersion: '2.1.0', now: new Date() }))).file.data
  await S.applyRestore?.(fileData, { now: new Date(2026, 9, 29, 11, 0) })
  check(
    'B1.22 applyRestore: tải bản an toàn trước, MỘT lần ghi (local + cache + epoch), xóa hàng đợi xóa + nháp editor',
    downloads.at(-1)?.filename === 'bbqone-before-restore-2026-10-29-1100.json' && setCalls - before === 1 &&
      store.get(LOCAL.LOCAL_STORAGE_KEYS.notes)?.map((n) => n.id).join() === 'nz' && store.get(STORAGE.NOTES_CACHE_KEY)?.[0]?.id === 'nz' &&
      typeof store.get(STORAGE.BBQ_RESTORE_EPOCH_KEY) === 'number' && !store.has(STORAGE.BBQ_PENDING_DELETE_COMMITS_KEY) &&
      !session.has(STORAGE.BBQ_NOTE_DRAFT_SESSION_KEY),
    `${downloads.at(-1)?.filename} set×${setCalls - before}`,
  )
}

console.log('\nT6 — nối dây giao diện (tĩnh)')
const features = read('src', 'constants', 'features.ts')
check('B1.23 cờ FEATURES.backupFileSignedIn = false (người đăng nhập: chỉ tải — code sẵn, tắt)', /backupFileSignedIn:\s*false/.test(features), 'thiếu cờ')
const settings = read('src', 'components', 'layout', 'SettingsModal.vue')
check(
  'B1.24 SettingsModal: <BackupSettingsSection> chỉ khi chưa đăng nhập (hoặc cờ bật — chỉ tải)',
  /<BackupSettingsSection[\s\S]{0,200}v-if="!auth\.isAuthenticated \|\| FEATURES\.backupFileSignedIn"/.test(settings) && /:signed-in="auth\.isAuthenticated"/.test(settings),
  'chưa gắn mục Sao lưu',
)
const section = read('src', 'components', 'backup', 'BackupSettingsSection.vue')
check(
  'B1.25 mục Sao lưu kiểu Termius: công tắc role="switch" + aria-checked, lần gần nhất, Sao lưu ngay, Khôi phục (ẩn khi đăng nhập)',
  /role="switch"/.test(section) && /:aria-checked=/.test(section) && /backup\.last/.test(section) && /backup\.now/.test(section) &&
    /v-if="!signedIn"[\s\S]{0,400}backup\.restore/.test(section),
  'thiếu phần giao diện',
)
check(
  'B1.26 khôi phục: popup → mở tab (chrome.tabs.getCurrent / create, ?restore=1); tab → <input type="file" accept=".json">',
  /chrome\.tabs\.getCurrent\(/.test(section) && /chrome\.tabs\.create\(/.test(section) && /restore=1/.test(section) &&
    /<input[^>]*type="file"[^>]*accept="\.json,application\/json"/.test(section),
  'chưa có luồng tab',
)
check(
  'B1.27 xác nhận 2 lần: hộp xem trước (BackupRestoreDialog → "Thay toàn bộ…") rồi RetroConfirm đỏ → applyRestore → tải lại trang',
  /<BackupRestoreDialog/.test(section) && /<RetroConfirm[\s\S]{0,400}danger/.test(section) && /applyRestore\(/.test(section) && /location\.reload\(\)/.test(section),
  'thiếu bước xác nhận',
)
const app = read('src', 'pages', 'App.vue')
check(
  'B1.28 App.vue: tự sao lưu sau khi vẽ xong (maybeAutoBackup, không chặn mở); ?restore → mở Cài đặt; epoch đổi → tải lại',
  /maybeAutoBackup\(/.test(app) && /route\.query\.restore/.test(app) && /BBQ_RESTORE_EPOCH_KEY/.test(app) && /location\.reload\(\)/.test(app),
  'App chưa nối',
)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const KEYS = ['backup.title', 'backup.auto', 'backup.autoDesc', 'backup.last', 'backup.never', 'backup.now', 'backup.restore', 'backup.warnPlain',
  'backup.error.not_json', 'backup.error.not_bbqone', 'backup.error.newer_format', 'backup.error.invalid', 'backup.error.too_large',
  'backup.preview.title', 'backup.preview.replace', 'backup.confirm.title', 'backup.confirm.message', 'backup.restored']
const missing = KEYS.filter((k) => !vi.includes(`'${k}'`) || !en.includes(`'${k}'`))
check('B1.29 i18n vi + en đủ chuỗi Sao lưu', missing.length === 0, missing.join(', '))

console.log('\nT7 — phát hành 2.1.0')
const V = '2.1.0'
const manifest = JSON.parse(read('public', 'manifest.json') || '{}')
const pkg = JSON.parse(read('package.json') || '{}')
const lock = JSON.parse(read('package-lock.json') || '{}')
check('B1.30 manifest / package.json / lock = 2.1.0; quyền không đổi', manifest.version === V && pkg.version === V && lock.version === V && lock.packages?.['']?.version === V &&
  JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'contextMenus', 'alarms', 'clipboardWrite', 'offscreen', 'bookmarks', 'downloads']),
  `${manifest.version}/${pkg.version}/${lock.version}`)
const readme = read('README.md')
check('B1.31 README: Version 2.1.0, "What changed in 2.1.0" (mục lục, trước 2.0.1) nói sao lưu tự động + khôi phục',
  readme.includes(`**Version:** ${V}`) && /\[What changed in 2\.1\.0\]\(#what-changed-in-210\)/.test(readme) &&
    readme.indexOf('## What changed in 2.1.0') < readme.indexOf('## What changed in 2.0.1') && /automatic backup/i.test(readme) && /restore/i.test(readme),
  'README')
const txt = read('docs', 'chrome-store-detailed-description.txt')
const pp = read('docs', 'privacy-policy.html')
check(
  "B1.32 Store: WHAT'S NEW IN 2.1.0 + Release 2.1.0 (highlights); privacy policy áp dụng từ 2.1.0 + đoạn Backup files; permissions doc: downloads cho file sao lưu",
  /WHAT'S NEW IN 2\.1\.0/.test(txt) && /Release 2\.1\.0 \(highlights\)/.test(read('docs', 'CHROME-STORE-LISTING.md')) &&
    /applies to extension version 2\.1\.0 and later/.test(pp) && /Backup files/.test(pp) && /Downloads/.test(pp) &&
    /\*\*v2\.1\.0\*\*/.test(read('docs', 'CHROME-STORE-PERMISSIONS.md')) && /backup file/i.test(read('docs', 'CHROME-STORE-PERMISSIONS.md')),
  'docs',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/B1-backup-file.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. B1 đúng spec.')
