/**
 * FAILING TEST — B2: sao lưu ra file mặc định chỉ bằng tay — tự động sao lưu TẮT cho mọi máy (kể cả máy 2.1.0–2.3.1 đã tự
 * ghi `autoEnabled: true`), người dùng tự bật trong Cài đặt mới tự tải file.
 *
 * Chạy:   node specs/B2-backup-manual-default.test.mjs
 * GREEN sau khi áp specs/B2-backup-manual-default.spec.md.
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
const B = load('src/utils/backupFile.ts', { '@/constants/calendar': CAL, '@/constants/storage': STORAGE, '@/types/localFirst': LOCAL,
  '@/utils/secureCrypto': load('src/utils/secureCrypto.ts'), '@/utils/controlChars': load('src/utils/controlChars.ts'), '@/utils/safeUrl': load('src/utils/safeUrl.ts') })

const store = new Map()
const downloads = []
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => store.has(k)).map((k) => [k, structuredClone(store.get(k))])),
      set: async (obj) => { for (const [k, v] of Object.entries(obj)) store.set(k, structuredClone(v)) },
      remove: async (keys) => { for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k) },
    },
    session: { remove: async () => {} },
  },
  downloads: { download: async (opts) => { downloads.push(opts); return downloads.length } },
  runtime: { getManifest: () => ({ version: '2.3.1' }) },
}
globalThis.URL.createObjectURL = () => 'blob:mock'
globalThis.URL.revokeObjectURL = () => {}
const S = load('src/services/backupFile.service.ts', { '@/utils/backupFile': B, '@/constants/storage': STORAGE, '@/constants/calendar': CAL, '@/types/localFirst': LOCAL })

const T = '2026-11-03T03:00:00.000Z'
const ID = '00000000-0000-4000-8000-000000000b21'
store.set(LOCAL.LOCAL_STORAGE_KEYS.notes, [{ id: ID, user_id: '', folder_id: null, title: 'n', tags: [], position: 0, created_at: T, updated_at: T, synced_at: null }])
const KEY = STORAGE.BBQ_BACKUP_STATE_KEY
const day = (d) => new Date(2026, 10, d, 9, 0)

console.log('T1 — mặc định TẮT')
const st0 = await S.readBackupState()
const r0 = await S.maybeAutoBackup({ signedIn: false, now: day(3) })
check('B2.1 kho trống → autoEnabled false; mở popup không tải file', st0.autoEnabled === false && r0 === 'skipped' && downloads.length === 0, `${JSON.stringify(st0)} ${r0} ${downloads.length}`)

store.set(KEY, { autoEnabled: true, lastBackupAt: T, lastBackupDigest: 'abc', lastCheckDay: '2026-11-02', lastRestore: null })
const st1 = await S.readBackupState()
const r1 = await S.maybeAutoBackup({ signedIn: false, now: day(4) })
check('B2.2 kho kiểu 2.1.0–2.3.1 (autoEnabled: true tự ghi) → TẮT, field khác giữ; không tải file',
  st1.autoEnabled === false && st1.lastBackupAt === T && st1.lastBackupDigest === 'abc' && r1 === 'skipped' && downloads.length === 0,
  `${JSON.stringify(st1)} ${r1} ${downloads.length}`)

console.log('\nT2 — người dùng tự bật')
await S.writeBackupState({ autoEnabled: true })
const raw = store.get(KEY)
const r2 = await S.maybeAutoBackup({ signedIn: false, now: day(5) })
await S.writeBackupState({ lastCheckDay: '2026-11-05' })
const stillOn = (await S.readBackupState()).autoEnabled
await S.writeBackupState({ autoEnabled: false })
const off = store.get(KEY)
check('B2.3 bật → kho autoOptIn: true (không còn autoEnabled), tự sao lưu chạy; ghi trạng thái khác vẫn bật; tắt → autoOptIn: false',
  raw?.autoOptIn === true && !('autoEnabled' in raw) && r2 === 'saved' && downloads.length === 1 && stillOn === true &&
    off?.autoOptIn === false && !('autoEnabled' in off) && (await S.readBackupState()).autoEnabled === false,
  `${JSON.stringify(raw)} ${r2} ${stillOn} ${JSON.stringify(off)}`)

console.log('\nT3 — chữ + tài liệu')
const en = read('src', 'i18n', 'en.ts')
const vi = read('src', 'i18n', 'vi.ts')
check('B2.4 i18n backup.autoDesc: "Off by default" / "Mặc định tắt"',
  /'backup\.autoDesc': '[^']*Off by default/.test(en) && /'backup\.autoDesc': '[^']*Mặc định tắt/.test(vi), 'backup.autoDesc')

const readmeRow = read('README.md').split('\n').find((l) => l.startsWith('| **Backup files** |')) ?? ''
const desc = read('docs', 'chrome-store-detailed-description.txt')
const descSec = desc.slice(desc.indexOf('BACKUP FILES (NO ACCOUNT NEEDED)'), desc.indexOf('CLOUD SYNC (OPTIONAL)'))
const descNews = desc.split('\n').find((l) => l.startsWith('New: Backup files for use without an account')) ?? ''
const perms = read('docs', 'CHROME-STORE-PERMISSIONS.md')
const dl = perms.slice(perms.indexOf('### `downloads`'), perms.indexOf('## Host Permissions'))
const pp = read('docs', 'privacy-policy.html')
const ppBackup = pp.slice(pp.indexOf('<strong>Backup files.</strong>'), pp.indexOf('<strong>Address bar search.</strong>'))
const parts = { readmeRow, descSec, descNews, dl, ppBackup }
const bad = Object.entries(parts).filter(([, t]) => !/off by default/i.test(t) || /unless you turn it off|can be turned off|automatically \(once a day/i.test(t)).map(([k]) => k)
check('B2.5 README + mô tả Store (mục + WHAT\'S NEW) + permissions doc + privacy policy: tự động sao lưu mặc định tắt', bad.length === 0, `chưa sửa: ${bad.join(', ')}`)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/B2-backup-manual-default.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. B2 đúng spec.')
