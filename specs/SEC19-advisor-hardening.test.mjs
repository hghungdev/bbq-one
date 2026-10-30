/**
 * FAILING TEST — SEC-19: dọn cảnh báo Supabase Security Advisor (2026-10-30) — ghim search_path 5 hàm trigger, thu hồi
 * quyền gọi trực tiếp trigger SECURITY DEFINER bbq_trim_bookmark_backups. Ghi lại thành migration để dựng lại được.
 *
 * Chạy:   node specs/SEC19-advisor-hardening.test.mjs
 * GREEN sau khi áp specs/SEC19-advisor-hardening.spec.md.
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
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}

console.log('SEC-19 — supabase/migrations/021_advisor_hardening.sql')
const mig = read('supabase', 'migrations', '021_advisor_hardening.sql')
const code = mig.replace(/--.*$/gm, '')
const TRIGGERS = ['retronote_update_updated_at', 'notes_set_fts', 'note_bodies_set_fts', 'note_bodies_touch_parent_note', 'user_dictionary_set_fts']
const missing = TRIGGERS.filter((f) => !new RegExp(`alter function public\\.${f}\\(\\) set search_path = public;`, 'i').test(code))
check('SEC19.1 ghim search_path = public cho đủ 5 hàm trigger Advisor báo (không đổi thân hàm)',
  mig !== '' && missing.length === 0 && !/create or replace function public\.(retronote_update_updated_at|notes_set_fts|note_bodies_set_fts|note_bodies_touch_parent_note|user_dictionary_set_fts)/i.test(code),
  mig ? `thiếu: ${missing.join(', ')}` : 'chưa có file')
check('SEC19.2 thu hồi quyền gọi trực tiếp bbq_trim_bookmark_backups() từ public, anon, authenticated (trigger vẫn chạy)',
  /revoke all on function public\.bbq_trim_bookmark_backups\(\) from public, anon, authenticated;/i.test(code), 'thiếu revoke')
check('SEC19.3 KHÔNG đụng bbq_mfa_aal_ok (policy 2FA cần authenticated gọi được) và không đọc schema auth trong phần chạy',
  !/bbq_mfa_aal_ok/i.test(code) && !/auth\.(users|mfa_factors)/i.test(code), 'phần chạy có bbq_mfa_aal_ok / auth.*')
check('SEC19.4 có khối tự kiểm trong giao dịch (rollback) + khối gỡ (reset search_path) trong chú thích',
  /begin;[\s\S]*rollback;/i.test(mig) && /reset search_path/i.test(mig) && /note_bodies/.test(mig) && /bookmark_backups/.test(mig),
  'thiếu tự kiểm / gỡ')

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/SEC19-advisor-hardening.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. SEC-19 đúng spec.')
