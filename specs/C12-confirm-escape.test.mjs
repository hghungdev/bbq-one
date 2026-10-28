/**
 * FAILING TEST — C12: Esc không đóng được hộp xác nhận (RetroConfirm).
 *
 * Chạy:   node specs/C12-confirm-escape.test.mjs
 *
 * Panel chặn keydown (`@keydown.stop`) nên trình nghe Esc trên window của chính nó không bao giờ chạy.
 * GREEN sau khi áp specs/C12-confirm-escape.spec.md.
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

const src = fs.readFileSync(path.join(ROOT, 'src', 'components', 'ui', 'RetroConfirm.vue'), 'utf8')
const tpl = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'))
const script = src.slice(0, src.indexOf('<template>'))

const panelTag = (/<div\s+ref="panelRef"[\s\S]*?>/.exec(tpl) ?? [''])[0]
const handlerName = (/@keydown="(\w+)"/.exec(panelTag) ?? [])[1]
const body = handlerName
  ? (new RegExp(`function ${handlerName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(script) ?? [])[1] ?? ''
  : ''

console.log('C12 — RetroConfirm')
check(
  'C12.1 panel không còn @keydown.stop trần (nuốt luôn Esc của chính nó)',
  !/@keydown\.stop(?!\.)/.test(panelTag),
  panelTag.replace(/\s+/g, ' '),
)
check(
  'C12.2 panel tự xử lý phím: Esc → dismiss()',
  !!handlerName && /Escape/.test(body) && /dismiss\(\)/.test(body),
  `handler=${handlerName ?? 'không có'}`,
)
check(
  'C12.3 vẫn chặn phím lan xuống hộp thoại bên dưới (stopPropagation)',
  /stopPropagation\(\)/.test(body),
  'Esc sẽ đóng luôn hộp Sửa bên dưới',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C12-confirm-escape.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. C12 đúng spec.')
