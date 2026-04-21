/**
 * Validate mật khẩu tài khoản (Supabase) — tránh mật khẩu yếu / phổ biến.
 * Trả về mảng locale key — component tự dịch qua t().
 */
import type { I18nKey } from '@/i18n/en'

const COMMON_LOWER = new Set<string>([
  'password',
  'password1',
  'password12',
  'password123',
  '12345678',
  '123456789',
  'qwerty',
  'qwerty12',
  'qwerty123',
  'letmein',
  'welcome',
  'welcome1',
  'admin123',
  'passw0rd',
  'p@ssw0rd',
  'iloveyou',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'monkey',
  'dragon',
  'master',
  'login',
  'abc123',
  'abc12345',
])

const KEYBOARD_RUNS = [
  '0123',
  '1234',
  '2345',
  '3456',
  '4567',
  '5678',
  '6789',
  'qwer',
  'wert',
  'erty',
  'asdf',
  'sdfg',
  'dfgh',
  'zxcv',
  'xcvb',
  'cvbn',
]

function hasKeyboardOrDigitRun(lower: string): boolean {
  for (const frag of KEYBOARD_RUNS) {
    if (lower.includes(frag)) return true
    const rev = [...frag].reverse().join('')
    if (lower.includes(rev)) return true
  }
  return false
}

/**
 * @returns Array of i18n locale keys (empty = password acceptable). Does not trim — whitespace is an error.
 */
export function accountPasswordIssues(
  password: string,
  options?: { email?: string | null },
): I18nKey[] {
  const issues: I18nKey[] = []
  const p = password

  if (p.length > 0 && p.length < 8) {
    issues.push('pwWeak.minLen')
  }
  if (p.length > 72) {
    issues.push('pwWeak.maxLen')
  }
  if (/\s/.test(p)) {
    issues.push('pwWeak.noSpace')
  }

  if (p.length < 8) {
    return issues
  }

  const hasLetter = /[a-zA-Z\u00C0-\u024F]/.test(p)
  const hasDigit = /\d/.test(p)
  if (!hasLetter) {
    issues.push('pwWeak.needLetter')
  }
  if (!hasDigit) {
    issues.push('pwWeak.needDigit')
  }

  if (/^(.)\1{7,}$/.test(p)) {
    issues.push('pwWeak.noRepeat')
  }

  const lower = p.toLowerCase()
  if (COMMON_LOWER.has(lower)) {
    issues.push('pwWeak.common')
  }

  if (hasKeyboardOrDigitRun(lower)) {
    issues.push('pwWeak.keyboard')
  }

  const email = options?.email?.trim().toLowerCase()
  if (email && email.includes('@')) {
    const local = email.split('@')[0] ?? ''
    if (local.length >= 3 && lower.includes(local)) {
      issues.push('pwWeak.email')
    }
  }

  return issues
}

export function isAccountPasswordAcceptable(
  password: string,
  options?: { email?: string | null },
): boolean {
  return accountPasswordIssues(password, options).length === 0
}
