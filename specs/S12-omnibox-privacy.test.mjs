/**
 * FAILING TEST — S12 (SEC-12): gợi ý thanh địa chỉ (`bbq …`) có 3 chế độ — Tên + đoạn trích (mặc định, như F1) /
 * Chỉ tên / Tắt — chọn trong Cài đặt; chia sẻ màn hình lúc gõ `bbq` không còn buộc phải lộ đoạn ghi chú.
 *
 * Chạy:   node specs/S12-omnibox-privacy.test.mjs
 * GREEN sau khi áp specs/S12-omnibox-privacy.spec.md.
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

// ── T1 utils/omniboxNotes.ts (CODE THẬT) ──────────────────────────────────────────────────────────────────────────
console.log('T1 — chế độ + dòng gợi ý (utils/omniboxNotes.ts)')
const OMNI = tryLoad('src/utils/omniboxNotes.ts', { '@/utils/secureCrypto': { isEncryptedEnvelope: (v) => typeof v === 'string' && v.startsWith('enc:') } })
const parse = typeof OMNI.parseOmniboxMode === 'function' ? OMNI.parseOmniboxMode : null
const parsed = parse ? ['full', 'title', 'off', undefined, null, 'FULL', 'all', 3, {}].map((v) => parse(v)) : []
check("S12.1 parseOmniboxMode: 'full' / 'title' / 'off' giữ nguyên; giá trị lạ / thiếu → mặc định 'full' (DEFAULT_OMNIBOX_MODE)",
  !OMNI.__error && OMNI.DEFAULT_OMNIBOX_MODE === 'full' &&
    JSON.stringify(parsed) === JSON.stringify(['full', 'title', 'off', 'full', 'full', 'full', 'full', 'full', 'full']),
  OMNI.__error || (parse ? JSON.stringify(parsed) : 'chưa export parseOmniboxMode'))

const hit = { note: { id: 'n1', title: 'Kafka plan', folder_id: 'f1' }, snippet: '…mật khẩu VPN là hunter2…', titleMatch: true }
let full = ''
let def = ''
let titleOnly = ''
try {
  full = OMNI.omniboxDescription(hit, 'Công việc', 'kafka', 'Không tên', 'full')
  def = OMNI.omniboxDescription(hit, 'Công việc', 'kafka', 'Không tên')
  titleOnly = OMNI.omniboxDescription(hit, 'Công việc', 'kafka', 'Không tên', 'title')
} catch (e) {
  full = `lỗi: ${e.message}`
}
check("S12.2 'full' (và mặc định khi không truyền) = như F1: tên + thư mục + đoạn trích",
  /<match>Kafka<\/match> plan/.test(full) && full.includes('Công việc') && full.includes('hunter2') && def === full,
  `full=${full} · def=${def}`)
check("S12.3 'title' → chỉ tên (chữ khớp vẫn in đậm), KHÔNG đoạn trích, KHÔNG tên thư mục",
  /<match>Kafka<\/match> plan/.test(titleOnly) && !titleOnly.includes('hunter2') && !titleOnly.includes('Công việc') && !titleOnly.includes('<dim>'),
  titleOnly)

// ── T2 background.ts ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT2 — background.ts đọc chế độ, Tắt = không gợi ý, Enter không mang chữ đã gõ')
const storage = read('src', 'constants', 'storage.ts')
check("S12.4 constants/storage: BBQ_OMNIBOX_MODE_KEY = 'bbqone_omnibox_mode'",
  /export const BBQ_OMNIBOX_MODE_KEY = 'bbqone_omnibox_mode'/.test(storage), 'storage.ts')
const bg = read('src', 'background.ts')
const changed = (bg.match(/chrome\.omnibox\.onInputChanged\.addListener\([\s\S]*?\n\}\)\n/) || [''])[0]
const entered = (bg.match(/chrome\.omnibox\.onInputEntered\.addListener\([\s\S]*?\n\}\)\n/) || [''])[0]
check('S12.5 OMNIBOX_KEYS có khóa chế độ (đổi trong Cài đặt → cache gợi ý làm mới); mode = parseOmniboxMode(kho)',
  /const OMNIBOX_KEYS: string\[\] = \[[\s\S]*?BBQ_OMNIBOX_MODE_KEY,[\s\S]*?\]/.test(bg) && /mode: parseOmniboxMode\(r\[BBQ_OMNIBOX_MODE_KEY\]\)/.test(bg),
  'background.ts loadOmniboxData')
const offAt = changed.indexOf("data.mode === 'off'")
check("S12.6 onInputChanged: 'off' → dòng mặc định omnibox.off + suggest([]) TRƯỚC khi tìm; còn lại truyền data.mode vào omniboxDescription",
  offAt > 0 && offAt < changed.indexOf('searchNotesForOmnibox(') && /omniboxText\(data\.lang, 'omnibox\.off'\)/.test(changed) &&
    /suggest\(\[\]\)/.test(changed) && /omniboxDescription\([\s\S]*?,\s*data\.mode,?\s*\)/.test(changed),
  changed ? 'thiếu nhánh off / data.mode' : 'không thấy onInputChanged')
const offEnter = entered.indexOf("data.mode === 'off'")
check("S12.7 onInputEntered: 'off' → mở BBQOne KHÔNG kèm chữ đã gõ, không sao chép (trước resolveOmniboxNoteId)",
  offEnter > 0 && offEnter < entered.indexOf('resolveOmniboxNoteId(') && /openPopupAt\('\/dashboard'\)/.test(entered),
  entered ? 'thiếu nhánh off' : 'không thấy onInputEntered')

// ── T3 Cài đặt + i18n ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT3 — Cài đặt + i18n')
const sec = read('src', 'components', 'layout', 'OmniboxSettingsSection.vue')
const modal = read('src', 'components', 'layout', 'SettingsModal.vue')
check('S12.8 OmniboxSettingsSection: 3 lựa chọn (radio) ghi BBQ_OMNIBOX_MODE_KEY, đọc bằng parseOmniboxMode; ghi chú lịch sử Chrome; có trong SettingsModal',
  /type="radio"/.test(sec) && /v-for="opt in MODE_OPTIONS"/.test(sec) && /chrome\.storage\.local\.set\(\{\s*\[BBQ_OMNIBOX_MODE_KEY\]:/.test(sec) &&
    /parseOmniboxMode\(/.test(sec) && /t\('settings\.omnibox\.chromeHistory'\)/.test(sec) && /<OmniboxSettingsSection\s*\/>/.test(modal),
  sec ? 'thiếu radio / ghi kho / ghi chú / chưa gắn vào SettingsModal' : 'chưa có OmniboxSettingsSection.vue')
const KEYS = ['omnibox.off', 'settings.omnibox.title', 'settings.omnibox.desc', 'settings.omnibox.full', 'settings.omnibox.titleOnly',
  'settings.omnibox.off', 'settings.omnibox.chromeHistory']
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const missing = KEYS.flatMap((k) => [[vi, 'vi'], [en, 'en']].filter(([f]) => !f.includes(`'${k}'`)).map(([, l]) => `${l}:${k}`))
check('S12.9 i18n vi + en đủ khóa', missing.length === 0, `thiếu: ${missing.join(', ')}`)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S12-omnibox-privacy.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S12 đúng spec.')
