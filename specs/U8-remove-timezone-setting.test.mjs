/**
 * FAILING TEST — U8: gỡ mục Múi giờ (UTC) khỏi Settings; ngày folder/note theo giờ của máy.
 *
 * Chạy:   node specs/U8-remove-timezone-setting.test.mjs
 *
 * RED trên 7320254: Settings còn mục Múi giờ; ngày list dùng độ lệch tự chọn (mặc định UTC+0) → ở
 * UTC+7, note sửa lúc 01:30 sáng hiện ngày hôm trước.
 * GREEN sau khi áp specs/U8-remove-timezone-setting.spec.md.
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

const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return null
  }
}
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p))

console.log('U8 — gỡ Múi giờ khỏi Settings; ngày folder/note theo giờ máy')

const settingsSrc = read('src', 'components', 'layout', 'SettingsModal.vue') ?? ''
check(
  'U8.1 Settings không còn mục Múi giờ (UTC)',
  !settingsSrc.includes("t('settings.timezone')") &&
    !settingsSrc.includes('onUtcOffsetChange') &&
    !settingsSrc.includes('appTimezone'),
  'còn accordion Timezone',
)

const users = [
  ['src', 'main.ts'],
  ['src', 'components', 'folders', 'FolderItem.vue'],
  ['src', 'components', 'notes', 'NoteItem.vue'],
].filter((p) => (read(...p) ?? '').includes('appTimezone'))
check(
  'U8.2 bỏ store appTimezone (main.ts / FolderItem / NoteItem không còn dùng; file đã gỡ)',
  !exists('src', 'stores', 'appTimezone.ts') && users.length === 0,
  `còn dùng ở: ${JSON.stringify(users.map((p) => p.join('/')))}`,
)

// Hành vi (CODE THẬT): giờ máy ở UTC+7 — 2026-10-27T18:30Z = 01:30 sáng 28/10 giờ VN.
process.env.TZ = 'Asia/Ho_Chi_Minh'
let fmt = null
try {
  fmt = loadTsModule(path.join(ROOT, 'src', 'utils', 'appDateTime.ts')).formatListUpdatedAt
} catch (e) {
  check('U8.3 appDateTime load được', false, e.message)
}
if (fmt) {
  const got = fmt('2026-10-27T18:30:00Z')
  check(
    'U8.3 ngày list theo giờ máy (UTC+7): 18:30Z ngày 27 → 2026/10/28',
    got === '2026/10/28',
    `nhận ${got}`,
  )
  check('U8.4 chuỗi không hợp lệ → —', fmt('không phải ngày') === '—', `nhận ${fmt('không phải ngày')}`)
}

const appDateTimeSrc = read('src', 'utils', 'appDateTime.ts') ?? ''
check(
  'U8.5 appDateTime không còn độ lệch UTC tự chọn',
  !/utcOffset|UTC_OFFSET/i.test(appDateTimeSrc),
  'còn code độ lệch UTC',
)

const viSrc = read('src', 'i18n', 'vi.ts') ?? ''
const enSrc = read('src', 'i18n', 'en.ts') ?? ''
const orphan = ['settings.timezone', 'settings.timezoneDesc', 'settings.timezoneOffset', 'settings.utcOffsetCurrent'].filter(
  (k) => viSrc.includes(`'${k}'`) || enSrc.includes(`'${k}'`),
)
check('U8.6 gỡ i18n Múi giờ (không còn ai dùng)', orphan.length === 0, `còn: ${JSON.stringify(orphan)}`)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U8-remove-timezone-setting.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U8 đúng spec.')
