/**
 * FAILING TEST — S3b: tạm ẩn "Mã hóa tài khoản" khỏi Settings bằng cờ tính năng (không gỡ code S2C).
 *
 * Chạy:   node specs/S3b-hide-account-encryption.test.mjs
 * GREEN sau khi áp specs/S3b-hide-account-encryption.spec.md.
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

const features = read('src', 'constants', 'features.ts')
check(
  'S3b.1 cờ FEATURES.accountEncryptionSettings = false',
  /accountEncryptionSettings:\s*false/.test(features),
  'chưa có cờ',
)
const settings = read('src', 'components', 'layout', 'SettingsModal.vue')
const tpl = settings.slice(settings.indexOf('<template>'), settings.lastIndexOf('</template>')).replace(/\n\s*/g, ' ')
check(
  'S3b.2 Settings: mục "Mã hóa tài khoản" chỉ hiện khi cờ bật',
  /v-if="FEATURES\.accountEncryptionSettings && auth\.isAuthenticated"[^>]*:title="t\('account\.settingsTitle'\)"/.test(tpl),
  'mục mã hóa chưa gắn cờ',
)
check(
  'S3b.3 hộp "Bật mã hóa tài khoản" cũng gắn cờ (không mở được từ đâu khác)',
  /<AccountEncryptionSetupModal\s+v-if="FEATURES\.accountEncryptionSettings"/.test(tpl),
  'hộp bật mã hóa chưa gắn cờ',
)
const app = read('src', 'pages', 'App.vue')
check(
  'S3b.4 tài khoản ĐÃ bật vẫn được hỏi mở khóa (không bị kẹt)',
  /account\.unlockModalOpen = true/.test(app) && /<AccountUnlockModal/.test(app),
  'mất đường mở khóa',
)
const roadmap = read('specs', 'ROADMAP-S.md')
check(
  'S3b.5 ROADMAP-S ghi S3 + mục Settings TẠM HOÃN (chờ Sir nghiên cứu)',
  /S3b/.test(roadmap) && /tạm hoãn/i.test(roadmap),
  'chưa ghi vào plan',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S3b-hide-account-encryption.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S3b đúng spec.')
