/**
 * S9: độ mạnh mật khẩu thư mục bảo mật — áp khi TẠO / ĐỔI (không áp khi mở khóa hay nâng cấp số vòng).
 * Không thêm thư viện (zxcvbn ~800 KB): độ dài + danh sách mật khẩu phổ biến + vài mẫu dễ đoán.
 */
export const SECURE_FOLDER_MIN_PASSWORD = 10

export type PasswordIssue = 'tooShort' | 'common'

/** Đã chuẩn hóa: chữ thường, không dấu, chỉ a-z0-9. Khớp cả khi thêm số ở cuối (password123 → password). */
const COMMON = new Set([
  'password', 'passw0rd', 'pass', 'pa55word', 'admin', 'administrator', 'root', 'toor', 'guest', 'user', 'test', 'demo',
  'login', 'welcome', 'letmein', 'changeme', 'default', 'secret', 'access', 'master', 'qwerty', 'qwertyuiop', 'qwertz',
  'azerty', 'asdf', 'asdfgh', 'asdfghjkl', 'zxcvbnm', 'qazwsx', 'zaq12wsx', '1qaz2wsx', '1q2w3e4r', '1q2w3e4r5t', 'abc',
  'abcd', 'abcdef', 'abcdefg', 'abcdefgh', 'aa', 'iloveyou', 'iloveu', 'loveyou', 'love', 'lovely', 'baby', 'angel',
  'princess', 'monkey', 'dragon', 'football', 'baseball', 'soccer', 'sunshine', 'shadow', 'superman', 'batman',
  'starwars', 'pokemon', 'naruto', 'trustno1', 'hello', 'helloworld', 'freedom', 'whatever', 'michael', 'jennifer',
  'jordan', 'hunter', 'ranger', 'charlie', 'computer', 'internet', 'flower', 'cheese', 'summer', 'winter', 'family',
  'money', 'google', 'facebook', 'chrome', 'zalo', 'matkhau', 'matkhaumoi', 'matkhaucuatoi', 'anhyeuem', 'emyeuanh',
  'yeuem', 'yeuanh', 'vietnam', 'saigon', 'hanoi', 'bbqone', 'retronote', 'notes', 'ghichu', 'baomat', 'secure',
  'thumuc', 'folder',
])

function normalize(pw: string): string {
  return pw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function isDigitRun(s: string): boolean {
  if (!/^\d{4,}$/.test(s)) return false
  const up = '01234567890123456789'
  const down = '98765432109876543210'
  return up.includes(s) || down.includes(s)
}

export function secureFolderPasswordIssue(pw: string): PasswordIssue | null {
  if ([...pw].length < SECURE_FOLDER_MIN_PASSWORD) return 'tooShort'
  const n = normalize(pw)
  const core = n.replace(/\d+$/, '')
  if (COMMON.has(n) || (core.length >= 2 && COMMON.has(core))) return 'common'
  // Một ký tự lặp (aaaaaaaaaa), dãy số (0123456789), toàn chữ số ≤ 12 (ngày sinh, số điện thoại).
  if (/^(.)\1*$/.test(n) || isDigitRun(n) || /^\d{1,12}$/.test(n)) return 'common'
  return null
}
