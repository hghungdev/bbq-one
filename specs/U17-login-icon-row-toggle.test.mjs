/**
 * FAILING TEST — U17: icon Đăng nhập không còn giống Đăng xuất; bấm tên sự kiện = đánh dấu xong.
 *
 * Chạy:   node specs/U17-login-icon-row-toggle.test.mjs
 * GREEN sau khi áp specs/U17-login-icon-row-toggle.spec.md.
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

console.log('1 — icon đăng nhập')
const app = read('src', 'pages', 'App.vue')
const icons = read('src', 'components', 'ui', 'icons.ts')
// U20 (đổi có chủ đích): nút đăng nhập chuyển xuống đáy thanh dọc — <button>, không còn IconButton.
const loginBtn = (/<(?:IconButton|button)\s+v-if="isAnonymous"[\s\S]*?<\/(?:IconButton|button)>/.exec(app) ?? [''])[0]
check(
  'U17.1 chưa đăng nhập: icon người (user), không còn ⇤ log-in (ảnh lật của ⇥ đăng xuất)',
  /name="user"/.test(loginBtn) && !/name="log-in"/.test(app) && /\buser: \[/.test(icons) && !/'log-in'/.test(icons),
  loginBtn.replace(/\s+/g, ' ').slice(0, 160) || 'không thấy nút đăng nhập',
)
check('U17.2 đã đăng nhập: vẫn ⇥ log-out', /name="log-out"/.test(app), 'mất icon đăng xuất')

console.log('\n2 — dòng sự kiện trong danh sách ngày')
const modal = read('src', 'components', 'calendar', 'CalendarEventModal.vue')
const tpl = modal.slice(modal.indexOf('<template>'), modal.lastIndexOf('</template>'))
const row = (/<li\s[^>]*class="cal-modal__row ds-row"[\s\S]*?<\/li>/.exec(tpl) ?? [''])[0]
const main = (/<label\b[^>]*class="cal-modal__row-main"[\s\S]*?<\/label>/.exec(row) ?? [''])[0]
check(
  'U17.3 ô tick + vạch màu + tên nằm trong MỘT <label> → bấm tên = bấm ô tick',
  main !== '' && /type="checkbox"/.test(main) && /cal-modal__row-title/.test(main) && /onToggleDone\(/.test(main),
  main ? main.replace(/\s+/g, ' ').slice(0, 160) : 'chưa có label cal-modal__row-main',
)
check(
  'U17.4 chỉ ✎ mở màn Sửa (tên không còn startEdit)',
  (row.match(/startEdit\(ev\)/g) ?? []).length === 1 &&
    /name="pencil"/.test(row.slice(row.indexOf('startEdit(ev)'), row.indexOf('startEdit(ev)') + 120)) &&
    !/startEdit/.test(main),
  'tên vẫn mở Sửa / ✎ không mở Sửa',
)
check(
  'U17.5 tên ô tick = tên sự kiện (bỏ aria-label chung "Đánh dấu hoàn thành" trên ô tick)',
  !/<input[^>]*type="checkbox"[^>]*:aria-label/.test(main.replace(/\s+/g, ' ')),
  'ô tick vẫn có aria-label chung',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U17-login-icon-row-toggle.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U17 đúng spec.')
