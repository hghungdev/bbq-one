/**
 * FAILING TEST — S11 (SEC-11): "Xóa tất cả bookmark" — luôn tự sao lưu trước (lỗi sao lưu → không xóa gì) + gõ chữ xác
 * nhận (XOA / DELETE) mới mở nút xóa + báo số đã xóa và tên bản sao lưu.
 *
 * Chạy:   node specs/S11-delete-all-guard.test.mjs
 * GREEN sau khi áp specs/S11-delete-all-guard.spec.md.
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

// ── T1 nhãn + đếm ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('T1 — nhãn bản sao lưu trước khi xóa, đếm bookmark')
const LABEL = tryLoad('src/utils/bookmarkBackupLabel.ts')
const TREE = tryLoad('src/utils/bookmarkTree.ts')
let label = ''
try {
  label = LABEL.buildBookmarkBackupLabel('before-delete')
} catch (e) {
  label = `lỗi: ${e.message}`
}
check("S11.4 buildBookmarkBackupLabel('before-delete') → before-delete_backup_YYYY-MM-DD_HH-mm; kiểu nguồn có 'before-delete'",
  /^before-delete_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/.test(label) &&
    /BookmarkBackupLabelSource\s*=\s*[^\n]*'before-delete'/.test(read('src', 'utils', 'bookmarkBackupLabel.ts')),
  label)
const sample = [{ id: '0', title: '', children: [
  { id: '1', title: 'Bookmarks bar', children: [
    { id: '10', title: 'A', url: 'https://a.example/' },
    { id: '11', title: 'Dir', children: [{ id: '12', title: 'B', url: 'https://b.example/' }, { id: '13', title: 'Empty', children: [] }] },
  ] },
  { id: '2', title: 'Other bookmarks', children: [{ id: '20', title: 'C', url: 'https://c.example/' }] },
] }]
check('S11.7 countBookmarkUrls (utils/bookmarkTree.ts) đếm đúng số link (bỏ thư mục)',
  typeof TREE.countBookmarkUrls === 'function' && TREE.countBookmarkUrls(sample) === 3 && TREE.countBookmarkUrls([]) === 0,
  TREE.__error || (typeof TREE.countBookmarkUrls === 'function' ? `=${TREE.countBookmarkUrls(sample)}` : 'chưa export countBookmarkUrls'))

// ── T2 store: sao lưu TRƯỚC, lỗi sao lưu → không xóa ──────────────────────────────────────────────────────────────
console.log('\nT2 — stores/bookmarks.ts deleteAllFromBrowser (CODE THẬT)')
const calls = []
let saveShouldFail = false
const service = {
  getFromBrowser: async () => { calls.push('getFromBrowser'); return sample },
  saveBackup: async (tree, lbl) => {
    calls.push(`saveBackup:${lbl}`)
    if (saveShouldFail) throw new Error('network down')
    return { id: 'bk-new', label: lbl, tree_json: tree, created_at: '2026-10-30T00:00:00.000Z', browser_hint: 'chrome' }
  },
  deleteAllFromBrowser: async () => { calls.push('deleteAllFromBrowser') },
  listBackups: async () => [],
}
const storageWrites = []
let useBookmarksStore = null
const storeMod = tryLoad('src/stores/bookmarks.ts', {
  pinia,
  vue,
  '@/constants/storage': { BOOKMARKS_CACHE_KEY: 'bbqone_bookmarks_cache' },
  '@/services/bookmarks.service': { bookmarksService: service },
  '@/services/networkReachability.service': { isOnline: () => true },
  '@/stores/undoToast': { useUndoToastStore: () => ({ schedule: async () => {} }) },
  '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
  '@/utils/networkErrors': { isNetworkError: () => false },
  '@/utils/cacheWrite': { safeCacheWrite: async (k, v) => { storageWrites.push(k) }, stripEncryptedBackupTrees: (x) => x },
  '@/utils/bookmarkBackupLabel': LABEL,
  '@/utils/bookmarkTree': TREE,
})
useBookmarksStore = storeMod.useBookmarksStore
if (!useBookmarksStore) {
  check('S11.0 store bookmarks load được', false, storeMod.__error)
} else {
  globalThis.chrome = { storage: { local: { set: async () => {}, get: async () => ({}) } } }
  pinia.setActivePinia(pinia.createPinia())
  const S = useBookmarksStore()
  calls.length = 0
  const res = await S.deleteAllFromBrowser()
  const iSave = calls.findIndex((c) => c.startsWith('saveBackup:'))
  const iDel = calls.indexOf('deleteAllFromBrowser')
  check('S11.1 sao lưu (nhãn before-delete) chạy TRƯỚC khi xóa; trả { deleted: 3, label }; bản mới nằm đầu danh sách',
    iSave >= 0 && iDel > iSave && /saveBackup:before-delete_backup_/.test(calls[iSave]) &&
      res && res.deleted === 3 && /^before-delete_backup_/.test(res.label) && S.backups[0]?.id === 'bk-new',
    `calls=${calls.join(' → ')} res=${JSON.stringify(res)}`)

  pinia.setActivePinia(pinia.createPinia())
  const S2 = useBookmarksStore()
  calls.length = 0
  saveShouldFail = true
  const res2 = await S2.deleteAllFromBrowser()
  check('S11.2 sao lưu lỗi → KHÔNG gọi xóa, trả null, báo bookmark.deleteAllBackupFailed',
    !calls.includes('deleteAllFromBrowser') && res2 === null && String(S2.error).includes('bookmark.deleteAllBackupFailed'),
    `calls=${calls.join(' → ')} res=${JSON.stringify(res2)} error=${S2.error}`)
  saveShouldFail = false
}

// ── T3 gõ chữ xác nhận ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT3 — gõ chữ xác nhận (utils/deleteAllConfirm.ts + RetroConfirm + BookmarkTab)')
const WORD = tryLoad('src/utils/deleteAllConfirm.ts')
const typed = (s, l) => (typeof WORD.isDeleteAllWordTyped === 'function' ? WORD.isDeleteAllWordTyped(s, l) : null)
const okCases = [['XOA', 'vi'], ['xoa', 'vi'], ['XÓA', 'vi'], [' x ó a ', 'vi'], ['DELETE', 'en'], ['delete', 'en'], [' Delete ', 'en']]
const badCases = [['', 'vi'], ['XO', 'vi'], ['XOAA', 'vi'], ['DELETE', 'vi'], ['xoa', 'en'], ['DELET', 'en'], ['', 'en']]
const wrongOk = okCases.filter(([s, l]) => typed(s, l) !== true)
const wrongBad = badCases.filter(([s, l]) => typed(s, l) !== false)
check('S11.3 vi nhận XOA / XÓA (không phân biệt hoa thường, bỏ dấu + khoảng trắng); en nhận DELETE; gõ sai / thiếu → khóa',
  !WORD.__error && wrongOk.length === 0 && wrongBad.length === 0 && WORD.deleteAllWord?.('vi') === 'XOA' && WORD.deleteAllWord?.('en') === 'DELETE',
  WORD.__error || `nhận sai: ${JSON.stringify(wrongOk)} · mở sai: ${JSON.stringify(wrongBad)}`)

const rc = read('src', 'components', 'ui', 'RetroConfirm.vue')
check('S11.5 RetroConfirm: prop confirmDisabled → nút xác nhận :disabled, confirm() không chạy khi bị khóa',
  /confirmDisabled\?:\s*boolean/.test(rc) && /:disabled="confirmDisabled"/.test(rc) && /function confirm\(\): void \{\s*\n\s*if \(props\.confirmDisabled\) return/.test(rc),
  'RetroConfirm.vue')
const tab = read('src', 'components', 'bookmarks', 'BookmarkTab.vue')
const dlg = (tab.match(/<RetroConfirm\s+v-model:open="confirmDeleteAll"[\s\S]*?<\/RetroConfirm>/) || [''])[0]
check('S11.6 BookmarkTab: hộp xóa tất cả variant danger + ô gõ chữ + :confirm-disabled theo isDeleteAllWordTyped; xóa chữ khi mở lại; báo kết quả',
  /variant="danger"/.test(dlg) && /:confirm-disabled="!deleteAllWordOk"/.test(dlg) && /v-model="deleteAllTyped"/.test(dlg) &&
    /isDeleteAllWordTyped\(deleteAllTyped\.value,\s*lang\.value\)/.test(tab) && /deleteAllTyped\.value = ''/.test(tab) &&
    /const res = await bm\.deleteAllFromBrowser\(\)/.test(tab) && /t\('bookmark\.deleteAllDone',\s*\{\s*n:\s*res\.deleted,\s*label:\s*res\.label\s*\}\)/.test(tab),
  dlg ? 'thiếu một phần trong hộp / handler' : 'chưa có <RetroConfirm v-model:open="confirmDeleteAll" …>…</RetroConfirm>')

// ── T4 i18n ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT4 — i18n')
const KEYS = ['bookmark.deleteAllBackupFailed', 'bookmark.deleteAllDone', 'bookmark.deleteAllConfirmBtn']
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const missing = KEYS.flatMap((k) => [[vi, 'vi'], [en, 'en']].filter(([f]) => !f.includes(`'${k}'`)).map(([, l]) => `${l}:${k}`))
const doneVi = (vi.match(/'bookmark\.deleteAllDone':\s*\n?\s*'([^']*)'/) || [])[1] || ''
const doneEn = (en.match(/'bookmark\.deleteAllDone':\s*\n?\s*'([^']*)'/) || [])[1] || ''
const confVi = (vi.match(/'bookmark\.confirmDeleteAll':\s*\n?\s*'([^']*)'/) || [])[1] || ''
const confEn = (en.match(/'bookmark\.confirmDeleteAll':\s*\n?\s*'([^']*)'/) || [])[1] || ''
check('S11.8 vi + en đủ khóa; deleteAllDone có {n} + {label}; confirmDeleteAll nói sẽ tự sao lưu trước',
  missing.length === 0 && /\{n\}/.test(doneVi) && /\{label\}/.test(doneVi) && /\{n\}/.test(doneEn) && /\{label\}/.test(doneEn) &&
    /sao lưu/i.test(confVi) && /backup/i.test(confEn) && !/không thể hoàn tác/i.test(confVi) && !/cannot be undone/i.test(confEn),
  missing.length ? `thiếu: ${missing.join(', ')}` : `done=${doneVi} | ${doneEn} · confirm=${confVi} | ${confEn}`)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S11-delete-all-guard.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S11 đúng spec.')
