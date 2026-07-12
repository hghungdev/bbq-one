/**
 * FAILING TEST — N14: manifest/CWS polish.
 *
 * Chạy:   node specs/N14-manifest-cws-polish.test.mjs
 *
 * RED trên code hiện tại: W1/W2/W3/W5 fail. GREEN sau khi áp specs/N14-manifest-cws-polish.spec.md.
 * Sau GREEN nhớ `npm run build` để dist/manifest.json re-generate (test không check dist).
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

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8'))
const csp = manifest.content_security_policy?.extension_pages ?? ''
const permsDoc = fs.readFileSync(path.join(ROOT, 'docs', 'CHROME-STORE-PERMISSIONS.md'), 'utf8')

console.log('W1 — không còn web_accessible_resources (extension không có content script)')
check(
  'W1 manifest KHÔNG có key web_accessible_resources',
  !('web_accessible_resources' in manifest),
  `WAR=${JSON.stringify(manifest.web_accessible_resources)} — mọi website fetch được ` +
    'chrome-extension://<id>/bbq_one-final.png để fingerprint user cài BBQOne',
)

console.log('\nW2 — minimum_chrome_version khai đúng floor API đang dùng')
{
  const v = manifest.minimum_chrome_version
  const major = v ? parseInt(String(v).split('.')[0], 10) : NaN
  check(
    'W2 minimum_chrome_version >= 116 (khuyến nghị 127)',
    Number.isFinite(major) && major >= 116,
    `minimum_chrome_version=${JSON.stringify(v)} — getContexts cần 116+, action.openPopup ổn định 127+; ` +
      'Chrome cũ hơn: menu "Open Dashboard" chết câm',
  )
}

console.log('\nW3 — connect-src sạch wss (không dùng realtime)')
check('W3 CSP không chứa wss://', !csp.includes('wss://'),
  `csp connect-src còn wss — repo không có realtime/WebSocket nào`)

console.log('\nW4 — pin chống over-reach: các directive khác giữ nguyên')
check("W4.1 script-src vẫn có 'wasm-unsafe-eval' (Shiki)", csp.includes("'wasm-unsafe-eval'"),
  'Shiki WASM sẽ vỡ')
check("W4.2 'unsafe-inline' CHỈ trong style-src",
  /style-src[^;]*'unsafe-inline'/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp),
  'CSP bị siết/nới sai chỗ')
check('W4.3 connect-src vẫn còn https://*.supabase.co', csp.includes('https://*.supabase.co'),
  'cloud sync vỡ')
check('W4.4 permissions vẫn còn unlimitedStorage (N1)',
  Array.isArray(manifest.permissions) && manifest.permissions.includes('unlimitedStorage'),
  'N1 bị revert nhầm')

console.log('\nW5 — docs CHROME-STORE-PERMISSIONS.md đồng bộ')
{
  const remoteCodeStart = permsDoc.indexOf('## Remote Code')
  const remoteCodeSection = remoteCodeStart === -1 ? '' : permsDoc.slice(remoteCodeStart)
  check('W5.1 section Remote Code không còn "Realtime"',
    remoteCodeSection !== '' && !/Realtime/i.test(remoteCodeSection.slice(0, 1200)),
    'docs vẫn khai realtime endpoints — lệch với CSP mới')
  check('W5.2 docs không còn quote wss trong CSP',
    !permsDoc.includes('wss://*.supabase.co'),
    'CSP quote trong docs lệch manifest — form CWS sẽ điền sai')
}

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/N14-manifest-cws-polish.spec.md để chuyển sang PASS, rồi npm run build.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. Fix N14 đúng spec. (Nhớ npm run build cho dist/manifest.json.)')
