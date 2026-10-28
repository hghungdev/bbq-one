/**
 * FAILING TEST — U19: hộp nhập liệu bỏ "Hủy" (giữ ✕ + một nút chính); hộp xác nhận xóa giữ "Hủy".
 *
 * Chạy:   node specs/U19-drop-cancel-in-input-dialogs.test.mjs
 * GREEN sau khi áp specs/U19-drop-cancel-in-input-dialogs.spec.md.
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
const tpl = (...p) => {
  const s = fs.readFileSync(path.join(ROOT, 'src', ...p), 'utf8')
  return s.slice(s.indexOf('<template>'), s.lastIndexOf('</template>'))
}
const CANCEL = /t\('(common\.cancel|calendar\.modal\.btn\.cancel)'\)/

console.log('Hộp nhập liệu: không "Hủy", có ✕')
const INPUT = [
  ['calendar', 'CalendarEventModal.vue'],
  ['ui', 'QuickCreateModal.vue'],
  ['notes', 'MoveNoteModal.vue'],
  ['folders', 'SecureFolderModal.vue'],
  ['account', 'AccountEncryptionSetupModal.vue'],
  ['sync', 'CalendarOverflowResolverDialog.vue'],
]
for (const p of INPUT) {
  const t = tpl('components', ...p)
  check(`U19 ${p[1]}: bỏ "Hủy", có ✕ đóng`, !CANCEL.test(t) && /name="close"/.test(t) && /t\('common\.close'\)/.test(t), CANCEL.test(t) ? 'còn Hủy' : 'thiếu ✕')
}

const ev = tpl('components', 'calendar', 'CalendarEventModal.vue')
check(
  'U19.ev Sửa / Sự kiện mới: nút ‹ về danh sách ngày ở đầu tiêu đề (v-if="showForm", cancelForm)',
  /<button[^>]*v-if="showForm"[^>]*@click="cancelForm"[^>]*>\s*<AppIcon name="chevron-left"/.test(ev.replace(/\n\s*/g, ' ')),
  'chưa có ‹',
)
const acct = tpl('components', 'account', 'AccountEncryptionSetupModal.vue').replace(/\n\s*/g, ' ')
check(
  'U19.acct thiết lập mã hóa: "Quay lại" bên trái, nút chính (primary) bên phải ở bước 2 và 3',
  /account\.back[\s\S]{0,200}primary[\s\S]{0,120}goStep3/.test(acct) && /account\.back[\s\S]{0,200}primary[\s\S]{0,120}enable/.test(acct),
  'thứ tự / nút chính chưa đúng',
)

console.log('\nHộp xác nhận / quyết định: GIỮ "Hủy"')
for (const p of [['ui', 'RetroConfirm.vue'], ['folders', 'DeleteFolderModal.vue'], ['sync', 'SyncConflictDialog.vue']]) {
  check(`U19 giữ: ${p[1]} còn "Hủy"`, CANCEL.test(tpl('components', ...p)), 'bị bỏ nhầm')
}
check('U19 giữ: DeleteBackupModal còn "Hủy"', /bookmark\.deleteBackup\.cancelBtn/.test(tpl('components', 'bookmarks', 'DeleteBackupModal.vue')), 'bị bỏ nhầm')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U19-drop-cancel-in-input-dialogs.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U19 đúng spec.')
