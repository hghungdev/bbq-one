/**
 * FAILING TEST — C8: NoteEditor pagehide flush.
 * Chạy: node specs/C8-noteeditor-pagehide-flush.test.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EDITOR_PATH = path.join(ROOT, 'src', 'components', 'notes', 'NoteEditor.vue')
const src = fs.readFileSync(EDITOR_PATH, 'utf8')

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}

console.log('C8 — NoteEditor flush khi popup hide (static wiring)')

check(
  'C8.1 pagehide listener gọi flushSave',
  /addEventListener\s*\(\s*['"]pagehide['"]/.test(src)
    && /onPopupHideFlush|pagehide[\s\S]{0,120}flushSave/.test(src),
  'thiếu pagehide → flushSave — keystroke trong debounce 2s mất khi đóng popup',
)
check(
  'C8.2 visibilitychange:hidden gọi flushSave',
  /visibilitychange/.test(src)
    && /visibilityState\s*===\s*['"]hidden['"]/.test(src)
    && /flushSave/.test(src),
  'thiếu visibilitychange flush',
)
check(
  'C8.3 onMounted đăng ký listeners',
  /onMounted\s*\(/.test(src) && /addEventListener\s*\(\s*['"]pagehide['"]/.test(src),
  'listeners chưa mount',
)
check(
  'C8.4 onBeforeUnmount gỡ listeners',
  /removeEventListener\s*\(\s*['"]pagehide['"]/.test(src)
    && /removeEventListener\s*\(\s*['"]visibilitychange['"]/.test(src),
  'listener leak / không cleanup',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C8-noteeditor-pagehide-flush.spec.md')
  process.exit(1)
}
console.log('✅ PASS — C8 pagehide flush đúng spec.')
