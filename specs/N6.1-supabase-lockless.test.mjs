/**
 * FAILING TEST — N6.1: bỏ tùy chọn `lock` (deprecated) của Supabase auth — từ @supabase/auth-js 2.107 client tự điều phối
 * refresh token không cần mutex (single-flight trong ngữ cảnh + commit guard đọc lại kho + máy chủ trả token đang hiệu lực
 * cho refresh token cha). Từ 2.112.4 truyền `lock` → cảnh báo trên chrome://extensions; v3 sẽ bỏ hẳn tùy chọn.
 *
 * Chạy:   node specs/N6.1-supabase-lockless.test.mjs
 * GREEN sau khi áp specs/N6.1-supabase-lockless.spec.md.
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
const gte = (a, b) => {
  const pa = String(a).split(/[.-]/).map(Number)
  const pb = String(b).split(/[.-]/).map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  return true
}

console.log('N6.1 — Supabase auth không truyền lock')
const sb = read('src', 'services', 'supabase.ts')
const opts = (sb.match(/createClient\([\s\S]*?\n\}\)/) || [''])[0]
check('N6.1.1 createClient không truyền lock / lockAcquireTimeout (hết cảnh báo, sẵn cho supabase-js v3)',
  opts !== '' && !/\block\s*:/.test(opts) && !/lockAcquireTimeout/.test(opts) && !/supabaseAuthLock/.test(sb),
  opts ? 'còn lock trong createClient / import supabaseAuthLock' : 'không thấy createClient(...)')
check('N6.1.2 kho phiên vẫn dùng chung giữa popup / tab / service worker (chrome.storage.session) — commit guard của auth-js đọc lại đúng kho',
  /storage:\s*chromeSessionStorageAdapter/.test(opts) && /autoRefreshToken:\s*true/.test(opts) && /persistSession:\s*true/.test(opts),
  'đổi storage / autoRefresh / persistSession')
check('N6.1.3 webLock.ts bỏ supabaseAuthLock (code chết); các lock khác giữ nguyên',
  !/supabaseAuthLock/.test(read('src', 'utils', 'webLock.ts')) && /export const SYNC_LOCK = 'bbqone-sync'/.test(read('src', 'utils', 'webLock.ts')),
  'webLock.ts')
const lock = JSON.parse(read('package-lock.json') || '{}').packages ?? {}
const authJs = lock['node_modules/@supabase/auth-js']?.version ?? '0.0.0'
const pkgRange = JSON.parse(read('package.json') || '{}').dependencies?.['@supabase/supabase-js'] ?? ''
check('N6.1.4 @supabase/auth-js ≥ 2.107.0 (có điều phối không lock) và package.json supabase-js ≥ ^2.107 — hạ bản là mất chốt',
  gte(authJs, '2.107.0') && /^\^2\.(1[0-9]{2}|[2-9]\d{2})\./.test(pkgRange) && gte(pkgRange.replace(/^\^/, ''), '2.107.0'),
  `auth-js=${authJs} supabase-js=${pkgRange}`)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/N6.1-supabase-lockless.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. N6.1 đúng spec.')
