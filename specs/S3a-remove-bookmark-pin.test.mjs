/**
 * FAILING TEST — S3a: gỡ hẳn Bookmark PIN.
 *
 * Chạy:   node specs/S3a-remove-bookmark-pin.test.mjs
 * GREEN sau khi áp specs/S3a-remove-bookmark-pin.spec.md.
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
function loadTs(rel, mocks = {}) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const req = (s) => {
    if (s in mocks) return mocks[s]
    throw new Error(`Unmocked import in ${path.basename(rel)}: ${s}`)
  }
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports)
  return mod.exports
}
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}
function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.(ts|vue)$/.test(e.name)) out.push(p)
  }
  return out
}

console.log('S3a — gỡ Bookmark PIN')
const gone = [
  'src/stores/bookmarkPin.ts',
  'src/utils/bookmarkCrypto.ts',
  'src/utils/bookmarkSessionKey.ts',
  'src/utils/bookmarkPinValidation.ts',
  'src/services/bookmarkCryptoKeys.service.ts',
  'src/components/bookmarks/BookmarkPinModal.vue',
  'src/components/bookmarks/PinKeypad.vue',
]
const still = gone.filter((f) => fs.existsSync(path.join(ROOT, f)))
check('S3a.1 đã xóa 7 file PIN', still.length === 0, JSON.stringify(still))

const refs = walk(path.join(ROOT, 'src')).filter((f) =>
  /bookmarkPin|bookmarkCrypto|bookmarkSessionKey|bookmarkCryptoKeys|PinKeypad|BookmarkPinModal/.test(fs.readFileSync(f, 'utf8')),
)
check('S3a.2 không file nào còn import / gọi code PIN', refs.length === 0, JSON.stringify(refs.map((f) => path.relative(ROOT, f))))

// Hành vi (CODE THẬT): luôn lưu thường; row mã hóa cũ bị bỏ qua, không ném lỗi.
const inserted = []
const rows = [
  { id: 'b1', user_id: 'u1', label: 'auto_backup_1', tree_json: [{ id: '0', title: '' }], encrypted: false, payload_iv: null, payload_ciphertext: null, browser_hint: 'chrome', created_at: '2026-10-28T00:00:00Z' },
  { id: 'b2', user_id: 'u1', label: 'pin_backup', tree_json: null, encrypted: true, payload_iv: 'iv', payload_ciphertext: 'ct', browser_hint: 'chrome', created_at: '2026-10-27T00:00:00Z' },
]
const sb = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  from: () => ({
    select: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }),
    insert: (row) => ({
      select: () => ({
        single: async () => {
          inserted.push(row)
          return { data: { id: 'new', created_at: 'now', ...row }, error: null }
        },
      }),
    }),
  }),
}
let svc = null
try {
  svc = loadTs('src/services/bookmarks.service.ts', {
    './supabase': { supabase: sb },
    '@/utils/bookmarkFingerprint': { hashBookmarkTree: async () => 'h', setPersistedBookmarkTreeHash: async () => {} },
    // C15: import thuần mới của bookmarks.service (chỉ dùng khi hiển thị) — không liên quan PIN.
    '@/utils/bookmarkTree': { unwrapBookmarkRoot: (nodes) => nodes },
    '@/services/localFirst/authMode': { isAuthenticated: async () => true },
    '@/services/localFirst/localBookmarks.service': { localBookmarksService: {} },
  }).bookmarksService
} catch (e) {
  check('S3a.3 bookmarks.service load được không cần code PIN', false, e.message)
}
if (svc) {
  const list = await svc.listBackups().then((v) => v, (e) => e)
  check(
    'S3a.3 listBackups: trả bản thường, bỏ qua row mã hóa cũ (không ném lỗi, không cây rỗng)',
    Array.isArray(list) && list.length === 1 && list[0].id === 'b1',
    list instanceof Error ? list.message : JSON.stringify(list),
  )
  const saved = await svc.saveBackup([{ id: '0', title: '' }], 'manual').then((v) => v, (e) => e)
  check(
    'S3a.4 saveBackup: luôn lưu thường (encrypted: false, có tree_json)',
    !(saved instanceof Error) && inserted.length === 1 && inserted[0].encrypted === false && Array.isArray(inserted[0].tree_json),
    saved instanceof Error ? saved.message : JSON.stringify(inserted),
  )
  check(
    'S3a.5 gỡ hàm giải mã / mã hóa lại theo PIN',
    !('decryptAllEncryptedToPlaintext' in svc) && !('reencryptAllEncryptedBackups' in svc),
    'còn hàm PIN',
  )
}

const auto = read('src', 'services', 'bookmarkAutoBackup.service.ts')
check('S3a.6 tự động sao lưu không còn bị PIN chặn', !/cryptoRow|SessionKey|PIN/.test(auto), 'còn kiểm tra PIN')
const tab = read('src', 'components', 'bookmarks', 'BookmarkTab.vue')
check('S3a.7 tab Bookmark mở thẳng (không còn cổng PIN)', !/pinReady|pinGate|resolvePinGate/.test(tab) && /onMounted\(/.test(tab), 'còn cổng PIN')
const settings = read('src', 'components', 'layout', 'SettingsModal.vue')
check('S3a.8 Settings không còn mục Bookmark PIN', !/bookmarkPin|bmPin|settings\.pin/.test(settings), 'còn mục PIN')
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
check(
  'S3a.9 gỡ i18n PIN',
  !/'pin\.|'settings\.pin|'settings\.bookmarkPin/.test(vi) && !/'pin\.|'settings\.pin|'settings\.bookmarkPin/.test(en),
  'còn khóa i18n PIN',
)
const mig = read('supabase', 'migrations', '016_drop_bookmark_crypto.sql')
check('S3a.10 migration 016 xóa bảng bookmark_crypto', /drop table if exists (public\.)?bookmark_crypto/i.test(mig), 'chưa có migration')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S3a đúng spec.')
