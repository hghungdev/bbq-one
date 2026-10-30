/**
 * FAILING TEST — S2 (SEC-2): xác thực 2 bước TOTP (TÙY CHỌN — Sir chốt 2026-10-30) + chặn ở máy chủ (RLS aal2).
 * Đăng nhập có factor → phiên aal1 = CHƯA đăng nhập (không đồng bộ, không ghi cloud) cho tới khi nhập đúng mã 6 số.
 *
 * Chạy:   node specs/S2-mfa-totp.test.mjs
 * GREEN sau khi áp specs/S2-mfa-totp.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')
const vue = require('vue')
const pinia = require('pinia')

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
function loadTs(rel, mocks = {}) {
  const src = read(...rel.split('/'))
  if (!src) throw new Error(`chưa có ${rel}`)
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  const req = (s) => {
    if (s in mocks) return mocks[s]
    throw new Error(`Unmocked import in ${path.basename(rel)}: ${s}`)
  }
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports)
  return mod.exports
}
const tryLoad = (rel, mocks) => {
  try {
    return loadTs(rel, mocks)
  } catch (e) {
    return { __error: e.message }
  }
}
const errMsg = async (fn) => {
  try {
    await fn()
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

// ── Supabase giả có trạng thái: phiên aal1 / aal2 + danh sách factor ───────────────────────────────────────────────
const calls = []
const st = { session: null, aal: 'aal1', factors: [], cb: null }
const mkSession = () => ({ access_token: `tok-${st.aal}`, user: { id: 'u1', email: 'sir@example.com', factors: st.factors.map((f) => ({ ...f })) } })
const supabase = {
  auth: {
    async getSession() {
      return { data: { session: st.session }, error: null }
    },
    onAuthStateChange(cb) {
      st.cb = cb
      return { data: { subscription: { unsubscribe() {} } } }
    },
    async signInWithPassword({ password }) {
      calls.push('signIn')
      if (password !== 'pw-ok') return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } }
      st.aal = 'aal1'
      st.session = mkSession()
      return { data: { session: st.session, user: st.session.user }, error: null }
    },
    async signOut() {
      calls.push('signOut')
      st.session = null
      return { error: null }
    },
    async updateUser() {
      calls.push('updateUser')
      return { data: {}, error: null }
    },
    mfa: {
      async getAuthenticatorAssuranceLevel() {
        if (!st.session) return { data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] }, error: null }
        const verified = st.factors.some((f) => f.status === 'verified')
        return { data: { currentLevel: st.aal, nextLevel: verified ? 'aal2' : st.aal, currentAuthenticationMethods: [] }, error: null }
      },
      async listFactors() {
        calls.push('listFactors')
        const all = st.factors.map((f) => ({ ...f }))
        return { data: { all, totp: all.filter((f) => f.factor_type === 'totp' && f.status === 'verified'), phone: [], webauthn: [], recovery_code: [] }, error: null }
      },
      async challengeAndVerify({ factorId, code }) {
        calls.push(`verify:${factorId}:${code}`)
        if (code !== '123456') return { data: null, error: { message: 'Invalid TOTP code entered' } }
        const f = st.factors.find((x) => x.id === factorId)
        if (!f) return { data: null, error: { message: 'Factor not found' } }
        f.status = 'verified'
        st.aal = 'aal2'
        st.session = mkSession()
        st.cb?.('MFA_CHALLENGE_VERIFIED', st.session)
        return { data: {}, error: null }
      },
      async enroll({ factorType, friendlyName }) {
        calls.push(`enroll:${factorType}`)
        const f = { id: `f-${st.factors.length + 1}`, factor_type: 'totp', status: 'unverified', friendly_name: friendlyName }
        st.factors.push(f)
        return { data: { id: f.id, type: 'totp', friendly_name: friendlyName, totp: { qr_code: 'data:image/svg+xml;utf-8,%3Csvg%2F%3E', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/BBQOne' } }, error: null }
      },
      async unenroll({ factorId }) {
        calls.push(`unenroll:${factorId}`)
        st.factors = st.factors.filter((f) => f.id !== factorId)
        return { data: { id: factorId }, error: null }
      },
    },
  },
}
const mem = new Map()
globalThis.chrome = {
  storage: {
    local: {
      async get(k) {
        return typeof k === 'string' ? { [k]: mem.get(k) } : {}
      },
      async set(o) {
        for (const [k, v] of Object.entries(o)) mem.set(k, v)
      },
      async remove() {},
    },
    session: { async get() { return {} }, async set() {}, async remove() {}, async clear() {} },
  },
}
const LOGGED = 'bbq_auth_logged_in'
const storageConsts = { BBQ_AUTH_LOGGED_IN_KEY: LOGGED }

// ── T1 mfa.service ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log('T1 — services/mfa.service.ts (CODE THẬT)')
const MFA = tryLoad('src/services/mfa.service.ts', { './supabase': { supabase }, '@/services/supabase': { supabase } })
const svc = MFA.mfaService
if (!svc) {
  check('S2.0 mfa.service load được', false, MFA.__error)
} else {
  const seq = []
  st.session = null
  seq.push(await svc.isPending())
  st.factors = [{ id: 'f-1', factor_type: 'totp', status: 'verified' }]
  st.aal = 'aal1'
  st.session = mkSession()
  seq.push(await svc.isPending())
  st.aal = 'aal2'
  st.session = mkSession()
  seq.push(await svc.isPending())
  st.factors = []
  st.aal = 'aal1'
  st.session = mkSession()
  seq.push(await svc.isPending())
  check('S2.1 isPending: không phiên → false; có factor đã xác minh + aal1 → true; aal2 → false; không factor → false (chỉ đọc phiên, không listFactors)',
    JSON.stringify(seq) === '[false,true,false,false]' && !calls.includes('listFactors'), `${JSON.stringify(seq)} calls=${calls.join(',')}`)

  calls.length = 0
  st.factors = [{ id: 'f-old', factor_type: 'totp', status: 'unverified' }, { id: 'f-1', factor_type: 'totp', status: 'verified' }]
  const wrong = await errMsg(() => svc.verify('000000'))
  const right = await errMsg(() => svc.verify('123456'))
  check('S2.2 verify(code): dùng factor TOTP ĐÃ xác minh (không lấy factor dở); mã sai → ném lỗi; đúng → aal2',
    wrong !== null && right === null && calls.includes('verify:f-1:000000') && calls.includes('verify:f-1:123456') && !calls.some((c) => c.startsWith('verify:f-old')) && st.aal === 'aal2',
    `wrong=${wrong} right=${right} calls=${calls.join(',')}`)

  calls.length = 0
  st.factors = [{ id: 'f-dangling', factor_type: 'totp', status: 'unverified' }]
  let en = null
  const enErr = await errMsg(async () => { en = await svc.enrollTotp() })
  check('S2.3 enrollTotp: dọn factor TOTP dở dang trước, trả { factorId, qrCode (data:image/svg+xml), secret }',
    enErr === null && calls.indexOf('unenroll:f-dangling') > -1 && calls.indexOf('unenroll:f-dangling') < calls.indexOf('enroll:totp') &&
      /^data:image\/svg\+xml/.test(en?.qrCode ?? '') && en?.secret === 'JBSWY3DPEHPK3PXP' && typeof en?.factorId === 'string',
    `err=${enErr} en=${JSON.stringify(en)} calls=${calls.join(',')}`)
}

// ── T2 authMode.isAuthenticated: phiên aal1 chờ mã = chưa đăng nhập (service worker / mọi service dual-mode) ─────
console.log('\nT2 — services/localFirst/authMode.ts (CODE THẬT)')
const AM = tryLoad('src/services/localFirst/authMode.ts', {
  '@/services/supabase': { supabase },
  '@/services/supabaseAuthRecovery.service': { recoverSupabaseAuthFromStaleSession: async () => {} },
  '@/services/networkReachability.service': { isOnline: () => true },
  '@/constants/storage': storageConsts,
  '@/services/mfa.service': MFA,
})
if (typeof AM.isAuthenticated !== 'function') {
  check('S2.4 authMode load được', false, AM.__error)
} else {
  st.factors = [{ id: 'f-1', factor_type: 'totp', status: 'verified' }]
  st.aal = 'aal1'
  st.session = mkSession()
  const pending = await AM.isAuthenticated()
  st.aal = 'aal2'
  st.session = mkSession()
  const done = await AM.isAuthenticated()
  check('S2.4 isAuthenticated: aal1 còn chờ mã → false (không đồng bộ / không ghi cloud); aal2 → true', pending === false && done === true, `pending=${pending} done=${done}`)
}
const bab = read('src', 'services', 'bookmarkAutoBackup.service.ts')
check('S2.5 bookmarkAutoBackup (service worker) bỏ qua khi phiên còn chờ mã 2 bước (cả backup lẫn baseline)',
  (bab.match(/mfaService\.isPending\(\)/g) || []).length >= 2, 'bookmarkAutoBackup.service.ts')

// ── T3 auth store ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT3 — stores/auth.ts + services/auth.service.ts (CODE THẬT)')
const authSvcMod = tryLoad('src/services/auth.service.ts', {
  '@/constants/auth': { AUTH_SESSION_DEADLINE_KEY: 'deadline', SESSION_LOGIN_TIMEOUT_MS: 1000 },
  './supabase': { supabase },
  './mfa.service': MFA,
})
const storeMod = tryLoad('src/stores/auth.ts', {
  pinia,
  vue,
  '@/services/supabase': { supabase },
  '@/services/bookmarkAutoBackup.service': { bootstrapBookmarkBaseline: async () => {} },
  '@/utils/bookmarkFingerprint': { clearPersistedBookmarkTreeHash: async () => {} },
  '@/services/auth.service': authSvcMod,
  '@/services/supabaseAuthRecovery.service': { recoverSupabaseAuthFromStaleSession: async () => {} },
  '@/constants/storage': storageConsts,
  '@/services/calendarBannerDismiss.service': { clearUpcomingBannerDismiss: async () => {} },
  '@/services/mfa.service': MFA,
  '@/stores/uiLang': { useLangStore: () => ({ t: (k) => k }) },
})
if (!storeMod.useAuthStore) {
  check('S2.6 auth store load được', false, storeMod.__error || authSvcMod.__error)
} else {
  // S2.6 đăng nhập — tài khoản có 2FA
  pinia.setActivePinia(pinia.createPinia())
  let A = storeMod.useAuthStore()
  st.session = null
  st.factors = [{ id: 'f-1', factor_type: 'totp', status: 'verified' }]
  mem.clear()
  let res = null
  const loginErr = await errMsg(async () => { res = await A.login('sir@example.com', 'pw-ok') })
  await tick()
  check('S2.6 đăng nhập tài khoản có 2FA → { mfaRequired: true }, mfaPending, isAuthenticated = false, KHÔNG ghi cờ đã đăng nhập',
    loginErr === null && res?.mfaRequired === true && A.mfaPending === true && A.isAuthenticated === false && mem.get(LOGGED) !== true,
    `err=${loginErr} res=${JSON.stringify(res)} pending=${A.mfaPending} authed=${A.isAuthenticated} flag=${mem.get(LOGGED)}`)

  const badCode = typeof A.verifyMfa === 'function' ? await errMsg(() => A.verifyMfa('000000')) : 'chưa có verifyMfa'
  const stillPending = A.mfaPending
  const goodCode = typeof A.verifyMfa === 'function' ? await errMsg(() => A.verifyMfa('123456')) : 'chưa có verifyMfa'
  await tick()
  check('S2.7 mã sai → lỗi, vẫn chờ; mã đúng → hết chờ, isAuthenticated = true, ghi cờ đã đăng nhập',
    badCode !== null && stillPending === true && goodCode === null && A.mfaPending === false && A.isAuthenticated === true && mem.get(LOGGED) === true,
    `bad=${badCode} stillPending=${stillPending} good=${goodCode} pending=${A.mfaPending} authed=${A.isAuthenticated} flag=${mem.get(LOGGED)}`)

  // S2.8 không 2FA → như cũ
  pinia.setActivePinia(pinia.createPinia())
  A = storeMod.useAuthStore()
  st.session = null
  st.factors = []
  mem.clear()
  res = null
  await errMsg(async () => { res = await A.login('sir@example.com', 'pw-ok') })
  await tick()
  check('S2.8 tài khoản KHÔNG bật 2FA → đăng nhập như cũ (mfaRequired false, isAuthenticated true, có cờ)',
    res?.mfaRequired === false && A.mfaPending === false && A.isAuthenticated === true && mem.get(LOGGED) === true,
    `res=${JSON.stringify(res)} pending=${A.mfaPending} flag=${mem.get(LOGGED)}`)

  // S2.9 mở lại popup giữa chừng (phiên aal1 đã lưu) → vẫn chờ mã
  pinia.setActivePinia(pinia.createPinia())
  A = storeMod.useAuthStore()
  st.factors = [{ id: 'f-1', factor_type: 'totp', status: 'verified' }]
  st.aal = 'aal1'
  st.session = mkSession()
  await A.init()
  await tick()
  check('S2.9 init với phiên aal1 + factor đã xác minh → mfaPending, isAuthenticated = false', A.mfaPending === true && A.isAuthenticated === false,
    `pending=${A.mfaPending} authed=${A.isAuthenticated}`)

  // S2.10 đổi mật khẩu khi bật 2FA: thiếu mã → báo trước, KHÔNG đăng nhập lại; có mã → signIn → verify → updateUser
  st.aal = 'aal2'
  st.session = mkSession()
  if (typeof A.verifyMfa === 'function') await A.refreshMfa?.()
  await tick()
  calls.length = 0
  const noCode = await errMsg(() => A.changeAccountPassword('pw-ok', 'New-pw-2026x'))
  const callsNoCode = calls.slice()
  calls.length = 0
  const withCode = await errMsg(() => A.changeAccountPassword('pw-ok', 'New-pw-2026x', '123456'))
  const iSign = calls.indexOf('signIn')
  const iVer = calls.findIndex((c) => c.startsWith('verify:') && c.endsWith(':123456'))
  const iUpd = calls.indexOf('updateUser')
  check('S2.10 đổi mật khẩu khi bật 2FA: thiếu mã → mfa.err.codeRequired, không signIn; có mã → signIn → verify → updateUser (phiên vẫn aal2)',
    String(noCode).includes('mfa.err.codeRequired') && !callsNoCode.includes('signIn') && withCode === null && iSign >= 0 && iVer > iSign && iUpd > iVer && st.aal === 'aal2',
    `noCode=${noCode} calls1=${callsNoCode.join(',')} withCode=${withCode} calls2=${calls.join(',')}`)

  // S2.11 bật / tắt 2FA trong Cài đặt
  st.factors = []
  st.aal = 'aal1'
  st.session = mkSession()
  await A.refreshMfa?.()
  calls.length = 0
  let enr = null
  const enErr = typeof A.startTotpEnroll === 'function' ? await errMsg(async () => { enr = await A.startTotpEnroll() }) : 'chưa có startTotpEnroll'
  const confErr = typeof A.confirmTotpEnroll === 'function' && enr ? await errMsg(() => A.confirmTotpEnroll(enr.factorId, '123456')) : 'chưa có confirmTotpEnroll'
  await tick()
  const enabledAfter = A.mfaEnabled
  const disNoCode = typeof A.disableMfa === 'function' ? await errMsg(() => A.disableMfa('000000')) : 'chưa có disableMfa'
  const factorsAfterBad = st.factors.length
  const disOk = typeof A.disableMfa === 'function' ? await errMsg(() => A.disableMfa('123456')) : 'chưa có disableMfa'
  check('S2.11 bật: enroll → mã đúng → mfaEnabled; tắt: mã sai → giữ nguyên; mã đúng → gỡ factor, mfaEnabled = false',
    enErr === null && confErr === null && enabledAfter === true && disNoCode !== null && factorsAfterBad === 1 && disOk === null && A.mfaEnabled === false && st.factors.length === 0,
    `en=${enErr} conf=${confErr} enabled=${enabledAfter} disBad=${disNoCode} left=${factorsAfterBad} disOk=${disOk} now=${A.mfaEnabled}`)
}

// ── T4 giao diện + migration + i18n ────────────────────────────────────────────────────────────────────────────────
console.log('\nT4 — giao diện, migration RLS, i18n')
const form = read('src', 'components', 'auth', 'MfaChallengeForm.vue')
const lm = read('src', 'components', 'auth', 'LoginModal.vue')
const lp = read('src', 'pages', 'Login.vue')
const app = read('src', 'pages', 'App.vue')
check('S2.12 MfaChallengeForm (ô 6 số, inputmode numeric, autocomplete one-time-code) dùng trong LoginModal + trang Login khi auth.mfaPending; Hủy = đăng xuất; App mở hộp đăng nhập khi mfaPending',
  /inputmode="numeric"/.test(form) && /autocomplete="one-time-code"/.test(form) && /auth\.verifyMfa\(/.test(form) && /auth\.cancelMfa\(\)/.test(form) &&
    /<MfaChallengeForm/.test(lm) && /auth\.mfaPending/.test(lm) && /<MfaChallengeForm/.test(lp) && /auth\.mfaPending/.test(lp) &&
    /watch\(\s*\(\) => auth\.mfaPending/.test(app),
  'MfaChallengeForm / LoginModal / Login / App')
const sec = read('src', 'components', 'account', 'MfaSettingsSection.vue')
const modal = read('src', 'components', 'layout', 'SettingsModal.vue')
check('S2.13 Cài đặt › Xác thực 2 bước: QR (<img :src> data:) + chuỗi bí mật + ô mã; tắt cần mã; form đổi mật khẩu có ô mã khi bật 2FA',
  /<img[^>]*:src="enroll\.qrCode"/.test(sec) && /enroll\.secret/.test(sec) && /auth\.confirmTotpEnroll\(/.test(sec) && /auth\.disableMfa\(/.test(sec) &&
    /<MfaSettingsSection/.test(modal) && /auth\.mfaEnabled/.test(modal) && /changeAccountPassword\([^)]*acctPwMfaCode/.test(modal),
  'MfaSettingsSection / SettingsModal')
const mig = read('supabase', 'migrations', '019_mfa_enforce.sql')
check('S2.14 migration 019: policy RESTRICTIVE trên mọi bảng public có user_id (duyệt information_schema), aal2 khi có factor verified, idempotent',
  /as restrictive/i.test(mig) && /information_schema\.columns/i.test(mig) && /column_name\s*=\s*'user_id'/i.test(mig) && /auth\.mfa_factors/i.test(mig) &&
    /status\s*=\s*'verified'/i.test(mig) && /'aal2'/.test(mig) && /auth\.jwt\(\)\s*->>\s*'aal'/i.test(mig) && /drop policy if exists/i.test(mig) && /to authenticated/i.test(mig),
  mig ? 'thiếu thành phần' : 'chưa có file')
// S2.16 (thêm 2026-10-30 sau sự cố thật): role `authenticated` KHÔNG có quyền SELECT trên auth.mfa_factors → policy đọc
// thẳng bảng đó làm MỌI truy vấn của người đã đăng nhập lỗi "permission denied for table mfa_factors" (Load notes / Load
// calendar failed). Kiểm factor phải đi qua hàm SECURITY DEFINER (search_path rỗng, chỉ authenticated được gọi).
const policySql = (mig.match(/create policy[\s\S]*?\$p\$/i) || [''])[0]
check('S2.16 policy KHÔNG đọc thẳng auth.mfa_factors; dùng hàm public.bbq_mfa_aal_ok() SECURITY DEFINER, set search_path = \'\', revoke public + grant execute authenticated',
  policySql !== '' && !/mfa_factors/i.test(policySql) && /bbq_mfa_aal_ok\(\)/.test(policySql) &&
    /create or replace function public\.bbq_mfa_aal_ok\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i.test(mig) &&
    /revoke all on function public\.bbq_mfa_aal_ok\(\) from public/i.test(mig) && /grant execute on function public\.bbq_mfa_aal_ok\(\) to authenticated/i.test(mig),
  policySql ? `policy: ${policySql.replace(/\s+/g, ' ').slice(0, 160)}` : 'không thấy create policy')
const KEYS = ['mfa.title', 'mfa.desc', 'mfa.statusOn', 'mfa.statusOff', 'mfa.enable', 'mfa.disable', 'mfa.scanHint', 'mfa.secretLabel', 'mfa.codeLabel',
  'mfa.verify', 'mfa.cancel', 'mfa.loginPrompt', 'mfa.lostPhone', 'mfa.err.codeRequired', 'mfa.err.invalid', 'mfa.enabledOk', 'mfa.disabledOk']
const vi = read('src', 'i18n', 'vi.ts')
const en = read('src', 'i18n', 'en.ts')
const missing = KEYS.flatMap((k) => [[vi, 'vi'], [en, 'en']].filter(([f]) => !f.includes(`'${k}'`)).map(([, l]) => `${l}:${k}`))
check('S2.15 i18n vi + en đủ khóa', missing.length === 0, `thiếu: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/S2-mfa-totp.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. S2 đúng spec.')
