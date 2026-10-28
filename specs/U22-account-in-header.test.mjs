/**
 * FAILING TEST — U22: tài khoản lên header (kiểu Gmail — avatar + menu); ⚙ ở lại đáy thanh dọc.
 *
 * Chạy:   node specs/U22-account-in-header.test.mjs
 * GREEN sau khi áp specs/U22-account-in-header.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

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
const flat = (s) => s.replace(/\n\s*/g, ' ')

// ── A: avatarInitial (code thật) ─────────────────────────────────────────────
let avatarInitial = null
const avatarSrc = read('src', 'utils', 'accountAvatar.ts')
if (avatarSrc) {
  const js = ts.transpileModule(avatarSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  new Function('module', 'exports', js)(mod, mod.exports)
  avatarInitial = mod.exports.avatarInitial
}
const cases = [
  ['hghungdev@gmail.com', 'H'],
  ['  đức@x.vn', 'Đ'],
  ['_9lives@x.io', '9'],
  ['', ''],
  [null, ''],
  ['@@@', ''],
]
check(
  'U22.A avatarInitial: chữ / số đầu (Unicode), viết hoa; rỗng / null / không có chữ → ""',
  typeof avatarInitial === 'function' && cases.every(([i, o]) => avatarInitial(i) === o),
  typeof avatarInitial === 'function'
    ? cases.map(([i]) => `${JSON.stringify(i)}→${JSON.stringify(avatarInitial(i))}`).join(' ')
    : 'chưa có src/utils/accountAvatar.ts',
)

// ── S: cấu trúc ──────────────────────────────────────────────────────────────
const app = read('src', 'pages', 'App.vue')
const tpl = app.slice(app.indexOf('<template>'), app.lastIndexOf('</template>'))
const rail = (/<nav\b[^>]*class="shell__rail"[\s\S]*?<\/nav>/.exec(tpl) ?? [''])[0]
const drawer = (/<div\b[^>]*class="shell__drawer"[\s\S]*?<!-- \/drawer -->/.exec(tpl) ?? [''])[0]
const headerRight = (/<div class="shell__header-right">[\s\S]*?<\/header>/.exec(tpl) ?? [''])[0]

// U24 (đổi có chủ đích): ⚙ cũng rời thanh dọc / bảng mở rộng lên header (kiểu Gmail).
check(
  'U22.1 thanh dọc + bảng mở rộng: không 👤 / ⇥ / onGoLogin / onLogout (⚙ lên header — U24)',
  rail !== '' && drawer !== '' &&
    // U26 (đổi có chủ đích): ☁ chờ đồng bộ xuống đáy thanh — bấm nó mời đăng nhập (@sign-in="onGoLogin", có từ
    // trước); không còn NÚT đăng nhập / xuất nào trong thanh.
    !/name="user"|name="log-out"|onLogout/.test(rail) &&
    !/onGoLogin/.test(rail.replace('<SyncStatusBadge v-if="isAnonymous" @sign-in="onGoLogin" />', '')) &&
    !/name="user"|name="log-out"|onGoLogin|onLogout/.test(drawer),
  'thanh dọc / bảng mở rộng còn đăng nhập / xuất',
)
const accTag = (/<AccountMenu\b[\s\S]*?\/>/.exec(headerRight) ?? [''])[0]
// U26 (đổi có chủ đích): ☀ ☁ xuống đáy thanh dọc — header phải chỉ ⚙ → AccountMenu.
check(
  'U22.2 header phải: AccountMenu đứng cuối cùng, nối onGoLogin / onLogout + email',
  accTag !== '' &&
    headerRight.indexOf('<AccountMenu') > headerRight.indexOf('name="settings"') &&
    !/<(IconButton|button|ThemeModeToggle|CloudSyncStatusBadge|SyncStatusBadge)\b/.test(
      headerRight.slice(headerRight.indexOf('<AccountMenu')),
    ) &&
    /@sign-in="onGoLogin"/.test(accTag) && /@sign-out="onLogout"/.test(accTag) &&
    /:email="/.test(accTag) && /:signed-in="!isAnonymous"/.test(accTag) &&
    /import AccountMenu from '@\/components\/layout\/AccountMenu\.vue'/.test(app),
  flat(accTag).slice(0, 200) || 'header chưa có AccountMenu',
)

const acc = read('src', 'components', 'layout', 'AccountMenu.vue')
const accTpl = flat(acc.slice(acc.indexOf('<template>'), acc.lastIndexOf('</template>')))
const accScript = acc.slice(0, acc.indexOf('<template>'))
const signInBtn = (/<button\b[^>]*v-if="!signedIn"[\s\S]*?<\/button>/.exec(accTpl) ?? [''])[0]
check(
  'U22.3 chưa đăng nhập: nút viên 👤 + chữ "Đăng nhập" (icon + chữ) → emit sign-in',
  /name="user"/.test(signInBtn) && /\{\{\s*t\('app\.aria\.login'\)\s*\}\}/.test(signInBtn) &&
    /emit\('sign-in'\)/.test(acc),
  signInBtn.slice(0, 200) || 'chưa có nút đăng nhập',
)
const avatarBtn = (/<button\b[^>]*ref="triggerRef"[\s\S]*?<\/button>/.exec(accTpl) ?? [''])[0]
check(
  'U22.4 đã đăng nhập: avatar chữ cái (không email → 👤), aria-haspopup="menu" + aria-expanded + aria-label có email',
  /aria-haspopup="menu"/.test(avatarBtn) && /:aria-expanded="open"/.test(avatarBtn) &&
    (/t\('app\.account\.aria'/.test(avatarBtn) ||
      (/:aria-label="accountLabel"/.test(avatarBtn) && /accountLabel = computed\(\(\) => t\('app\.account\.aria'/.test(accScript))) &&
    /initial/.test(avatarBtn) && /name="user"/.test(avatarBtn) &&
    /avatarInitial\(/.test(accScript),
  avatarBtn.slice(0, 200) || 'chưa có avatar',
)
const menu = (/<div\b[^>]*role="menu"[\s\S]*$/.exec(accTpl) ?? [''])[0]
check(
  'U22.5 menu: email + "Đã đăng nhập"; menuitem ⇥ "Đăng xuất" (icon + chữ) → emit sign-out',
  /\{\{\s*email\s*\}\}/.test(menu) && /t\('app\.account\.signedIn'\)/.test(menu) &&
    /role="menuitem"[^>]*>[^<]*<AppIcon name="log-out"/.test(menu) &&
    /\{\{\s*t\('app\.aria\.logout'\)\s*\}\}/.test(menu) && /emit\('sign-out'\)/.test(acc),
  menu.slice(0, 200) || 'chưa có menu',
)
check(
  'U22.6 bàn phím / chuột: Esc đóng + trả focus avatar; bấm ra ngoài / Tab ra ngoài đóng; mở thì focus "Đăng xuất"',
  /'Escape'/.test(accScript) && /triggerRef\.value\?\.focus\(\)/.test(accScript) &&
    /addEventListener\('pointerdown'/.test(accScript) && /removeEventListener\('pointerdown'/.test(accScript) &&
    /@focusout="onFocusOut"/.test(accTpl) && /signOutRef\.value\?\.focus\(\)/.test(accScript) &&
    /onBeforeUnmount/.test(accScript),
  'thiếu xử lý đóng / focus',
)
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
check(
  'U22.7 i18n vi / en: app.account.aria ({email}) + app.account.signedIn',
  /'app\.account\.aria': 'Tài khoản \{email\}'/.test(vi) && /'app\.account\.aria': 'Account \{email\}'/.test(en) &&
    /'app\.account\.signedIn': 'Đã đăng nhập'/.test(vi) && /'app\.account\.signedIn': 'Signed in'/.test(en),
  'thiếu khóa i18n',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U22-account-in-header.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U22 đúng spec.')
