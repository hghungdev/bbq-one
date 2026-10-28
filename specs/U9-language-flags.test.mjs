/**
 * FAILING TEST — U9: cờ ngôn ngữ hình chữ nhật, không bọc trong ô bo tròn.
 *
 * Chạy:   node specs/U9-language-flags.test.mjs
 * GREEN sau khi áp specs/U9-language-flags.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

console.log('U9 — cờ ngôn ngữ hình chữ nhật')
const flag = read('src', 'components', 'ui', 'LangFlagIcon.vue')
const svgRule = flag.slice(flag.indexOf('.lang-flag-svg {'), flag.indexOf('}', flag.indexOf('.lang-flag-svg {')))
const radius = /border-radius:\s*(\d+)px/.exec(svgRule)
check(
  'U9.1 LangFlagIcon góc vuông (≤ 3 px), không dùng --radius-sm',
  !svgRule.includes('var(--radius') && radius !== null && Number(radius[1]) <= 3,
  svgRule.replace(/\s+/g, ' '),
)

const settings = read('src', 'components', 'layout', 'SettingsModal.vue')
const start = settings.indexOf("t('settings.language')")
const block = settings.slice(start, settings.indexOf('</SettingsAccordionSection>', start))
check(
  'U9.2 không bọc cờ trong RetroButton pill; không disable ngôn ngữ đang chọn',
  block.length > 0 && !block.includes('<RetroButton') && !/:disabled="langStore\.lang/.test(block),
  'còn RetroButton / disabled',
)
check(
  'U9.3 radiogroup + radio aria-checked (đọc được trạng thái đang chọn)',
  block.includes('role="radiogroup"') && (block.match(/role="radio"/g) ?? []).length >= 1 && block.includes(':aria-checked'),
  'thiếu ngữ nghĩa radio',
)
check(
  'U9.4 có tên ngôn ngữ dưới cờ (English / Tiếng Việt)',
  /English/.test(settings) && /Tiếng Việt/.test(settings) && block.includes('settings-lang-name'),
  'thiếu tên ngôn ngữ',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U9 đúng spec.')
