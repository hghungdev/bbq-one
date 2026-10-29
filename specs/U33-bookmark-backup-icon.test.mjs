/**
 * FAILING TEST — U33: Bookmark — "Sao lưu ngay" thành icon ☁↑ + tooltip ở đầu cột SAO LƯU (bỏ nút chữ trên thanh công cụ).
 *
 * Chạy:   node specs/U33-bookmark-backup-icon.test.mjs
 * GREEN sau khi áp specs/U33-bookmark-backup-icon.spec.md.
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

const bm = fs.readFileSync(path.join(ROOT, 'src', 'components', 'bookmarks', 'BookmarkTab.vue'), 'utf8')
const tpl = bm.slice(bm.indexOf('<template>'), bm.lastIndexOf('</template>'))
const tbStart = tpl.indexOf('class="bm-tab__toolbar"')
const toolbar = tbStart === -1 ? '' : tpl.slice(tbStart, tpl.indexOf('</div>', tpl.indexOf('<InlineSearch', tbStart)))
// Header tự đóng (`… />`) = chưa có nút — không để regex chạy lố sang header cột bên phải.
const backupsHeader = (/<SectionHeader :label="t\('bookmark\.backups'\)"[^>]*?(?<!\/)>([\s\S]*?)<\/SectionHeader>/.exec(tpl) ?? ['', ''])[1]
const btn = (/<button[\s\S]*?<\/button>/.exec(backupsHeader) ?? [''])[0]

console.log('T — nút sao lưu')
check(
  'U33.1 thanh công cụ hết nút chữ "Sao lưu ngay" (không ds-primary, không bm.backup)',
  toolbar.length > 0 && !/ds-primary|bm\.backup\(|bookmark\.backupNow/.test(toolbar),
  toolbar.slice(0, 200),
)
check(
  'U33.2 icon ☁↑ ở đầu cột SAO LƯU: ds-icon-action--accent, upload-cloud, tooltip + aria "Sao lưu ngay", khóa khi đang tải',
  /class="ds-icon-action ds-icon-action--accent"/.test(btn) && /<AppIcon name="upload-cloud"/.test(btn) &&
    /:aria-label="t\('bookmark\.backupNow'\)"/.test(btn) && /:title="t\('bookmark\.backupNow'\)"/.test(btn) &&
    /:disabled="bm\.loading"/.test(btn) && /@click="bm\.backup\(backupLabel\)"/.test(btn),
  btn || 'đầu cột Sao lưu chưa có nút',
)
check('U33.3 tab Bookmark không còn nút chữ đặc nào (ds-primary)', !/ds-primary/.test(tpl), 'còn ds-primary')
check(
  'U33.4 thanh công cụ còn dòng "Sao lưu lần cuối" + 🔍 tìm bookmark',
  /bookmark\.lastBackup/.test(toolbar) && /<InlineSearch/.test(toolbar),
  'mất hint / tìm',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U33-bookmark-backup-icon.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U33 đúng spec.')
