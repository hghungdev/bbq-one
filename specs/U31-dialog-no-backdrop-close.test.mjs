/**
 * FAILING TEST — U31: hộp thoại không đóng khi bấm ra ngoài (nền mờ); chỉ đóng bằng ✕ / Hủy / Đóng và Esc.
 *
 * Chạy:   node specs/U31-dialog-no-backdrop-close.test.mjs
 * GREEN sau khi áp specs/U31-dialog-no-backdrop-close.spec.md.
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
const read = (rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8')
  } catch {
    return ''
  }
}
const templateOf = (src) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'))
const scriptOf = (src) => (src.indexOf('<template>') > 0 ? src.slice(0, src.indexOf('<template>')) : src)

/** Hộp thoại có nền mờ → nút đóng nhìn thấy được (✕ hoặc Hủy / Đóng) phải còn. */
const DIALOGS = {
  'src/components/calendar/CalendarEventModal.vue': /name="close"/,
  'src/components/calendar/CalendarOverdueReminderDialog.vue': /name="close"/,
  'src/components/ui/QuickCreateModal.vue': /name="close"/,
  'src/components/notes/MoveNoteModal.vue': /name="close"/,
  'src/components/folders/DeleteFolderModal.vue': /@click="emit\('close'\)"/,
  'src/components/bookmarks/DeleteBackupModal.vue': /@click="emit\('close'\)"/,
  'src/components/ui/RetroConfirm.vue': /name="close"/,
  'src/components/auth/LoginModal.vue': /name="close"/,
  'src/components/folders/SecureFolderModal.vue': /name="close"/,
  'src/components/account/AccountUnlockModal.vue': /@click="onClose"/,
  'src/components/account/AccountEncryptionSetupModal.vue': /name="close"/,
  'src/components/layout/SettingsModal.vue': /class="ds-text-action settings-close" @click="emit\('close'\)"/,
  'src/components/sync/SyncConflictDialog.vue': /name="close"/,
  'src/components/sync/ConflictBackupsDialog.vue': /name="close"/,
  'src/components/sync/CalendarOverflowResolverDialog.vue': /name="close"/,
}

console.log('T1 — bấm nền không đóng hộp')
for (const [rel, closeBtn] of Object.entries(DIALOGS)) {
  const src = read(rel)
  const name = path.basename(rel, '.vue')
  if (!src) {
    check(`U31 ${name} tồn tại`, false, 'không đọc được')
    continue
  }
  const tpl = templateOf(src)
  const backdropClose = /@click\.self=/.test(tpl) || /class="settings-backdrop"[^>]*@click/.test(tpl)
  check(`U31.1 ${name}: không còn đóng khi bấm nền`, !backdropClose, (/[^\n]*@click\.self=[^\n]*/.exec(tpl) ?? ['settings-backdrop @click'])[0].trim())
  check(`U31.2 ${name}: hết hàm onBackdropClick thừa`, !/onBackdropClick/.test(src), 'còn onBackdropClick')
  check(
    `U31.3 ${name}: vẫn đóng được bằng Esc + nút ✕ / Hủy / Đóng`,
    /'Escape'/.test(scriptOf(src)) && closeBtn.test(tpl),
    `Esc=${/'Escape'/.test(scriptOf(src))} nút=${closeBtn.test(tpl)}`,
  )
}

console.log('\nT2 — chốt chặn cho hộp sau này (mọi .vue)')
const offenders = []
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (ent.name.endsWith('.vue')) {
      const tpl = templateOf(fs.readFileSync(p, 'utf8'))
      for (const tag of tpl.match(/<[a-zA-Z][^>]*>/g) ?? []) {
        // `bbqone-overlay` là class xếp lớp dùng chung (cả menu nổi) — chỉ xét lớp nền thật: …backdrop / …-overlay.
        const classes = (/\bclass="([^"]*)"/.exec(tag)?.[1] ?? '').split(/\s+/).filter((c) => c !== 'bbqone-overlay')
        if (classes.some((c) => /backdrop|overlay/.test(c)) && /@(click|mousedown|pointerdown)\b/.test(tag)) {
          offenders.push(`${path.relative(ROOT, p)}: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`)
        }
      }
    }
  }
}
walk(path.join(ROOT, 'src'))
check('U31.4 không lớp nền / overlay nào gắn @click / @mousedown / @pointerdown', offenders.length === 0, offenders.join(' | '))

console.log('\nT3 — menu / bảng nổi vẫn đóng khi bấm ra ngoài (KHÔNG đổi)')
check(
  'U31.5 menu ⚙ dòng, menu tài khoản, bảng chip lịch vẫn nghe bấm ngoài',
  /addEventListener\('mousedown', onDoc\)/.test(read('src/components/ui/ListItemSettingsMenu.vue')) &&
    /addEventListener\('pointerdown', onDocPointerDown, true\)/.test(read('src/components/layout/AccountMenu.vue')) &&
    /addEventListener\('pointerdown', onDocPointerDown, true\)/.test(read('src/components/calendar/CalendarAgendaChip.vue')),
  'menu bị đổi',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U31-dialog-no-backdrop-close.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U31 đúng spec.')
