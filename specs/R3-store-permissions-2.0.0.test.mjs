/**
 * FAILING TEST — R3: lý do quyền trên Chrome Web Store khớp code 2.0.0.
 *
 * Chạy:   node specs/R3-store-permissions-2.0.0.test.mjs
 * GREEN sau khi áp specs/R3-store-permissions-2.0.0.spec.md.
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
const doc = read('docs', 'CHROME-STORE-PERMISSIONS.md')
const manifest = JSON.parse(read('public', 'manifest.json'))

/** Khối ```text đầu tiên sau tiêu đề `heading` (dán thẳng vào ô Store). */
function paste(heading) {
  const i = doc.indexOf(heading)
  if (i < 0) return ''
  const m = /```text\n([\s\S]*?)\n```/.exec(doc.slice(i))
  return m ? m[1] : ''
}
const fields = {
  purpose: paste('## Single Purpose'),
  ...Object.fromEntries(manifest.permissions.map((p) => [p, paste(`### \`${p}\``)])),
  host: paste('### `https://*.supabase.co/*`'),
}

check(
  'R3.1 mỗi quyền trong manifest + mục đích + quyền máy chủ có khối dán sẵn, mỗi khối ≤ 1 000 ký tự',
  Object.values(fields).every((t) => t.length > 0 && t.length <= 1000) && manifest.host_permissions.join() === 'https://*.supabase.co/*',
  Object.entries(fields).map(([k, t]) => `${k}:${t.length}`).join(' '),
)
check(
  'R3.2 mục đích: thư mục bảo mật thuộc Ghi chú; không còn "single search bar"; không content script',
  /notes?[^.]*secure folders?/i.test(fields.purpose) && !/bookmarks?[^.]*secure folders?/i.test(fields.purpose) &&
    !/single search bar/i.test(fields.purpose) && /does not inject/i.test(fields.purpose),
  fields.purpose.slice(0, 160),
)
check(
  'R3.3 storage: session giữ token đăng nhập + bản nháp ghi chú + khóa đã mở (không còn "only … auth session token")',
  /draft/i.test(fields.storage) && /unlocked key|unlocked note key/i.test(fields.storage) && /sign-in session/i.test(fields.storage) &&
    !/only to hold the Supabase auth session token/i.test(fields.storage),
  fields.storage.slice(0, 160),
)
check(
  'R3.4 alarms: 4 việc (đồng bộ 24 giờ, thử lại 5 phút, chốt xóa sau Undo, tự khóa 30 phút); ẩn danh không gọi mạng',
  /24-hour/.test(fields.alarms) && /5-minute/.test(fields.alarms) && /Undo/.test(fields.alarms) && /auto-lock/i.test(fields.alarms) &&
    /30 minutes/.test(fields.alarms) && /no network requests/i.test(fields.alarms),
  fields.alarms.slice(0, 160),
)
check(
  'R3.5 clipboardWrite: Copy note + sao chép link Google Calendar; không đọc clipboard. offscreen: fallback từ popup',
  /Copy note/.test(fields.clipboardWrite) && /Google Calendar link/.test(fields.clipboardWrite) && /never reads/i.test(fields.clipboardWrite) &&
    /navigator\.clipboard/.test(fields.offscreen) && /CLIPBOARD/.test(fields.offscreen) && /clos/i.test(fields.offscreen),
  'clipboard / offscreen chưa khớp',
)
check(
  'R3.6 bookmarks: không còn mã hóa Bookmark; có Khôi phục (chỉ khi user xác nhận) + lắng nghe 4 sự kiện',
  !/encrypt/i.test(fields.bookmarks) && /Restore/.test(fields.bookmarks) && /confirm/i.test(fields.bookmarks) &&
    ['onCreated', 'onRemoved', 'onChanged', 'onMoved'].every((e) => fields.bookmarks.includes(e)),
  fields.bookmarks.slice(0, 160),
)
check(
  'R3.7 quyền máy chủ: không "bookmarks (optionally encrypted)" / "their Supabase project"; có link Google Calendar; ẩn danh không gửi request',
  !/optionally encrypted/i.test(fields.host) && !/their Supabase project/i.test(fields.host) && /Google Calendar link/.test(fields.host) &&
    /not signed in never/i.test(fields.host) && /Row Level Security/.test(fields.host) && /no content scripts/i.test(fields.host),
  fields.host.slice(0, 160),
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/R3-store-permissions-2.0.0.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. R3 đúng spec.')
