/**
 * Kiểm tra PIN bookmark yếu / quá phổ biến (đặt PIN & đổi PIN).
 * Không dùng khi mở khóa — user có thể đã đặt trước khi có rule.
 * Trả về locale key — component tự dịch qua t().
 */
import type { I18nKey } from '@/i18n/en'

const WEAK_6 = new Set<string>([
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999',
  '012345',
  '123450',
  '123456',
  '234567',
  '345678',
  '456789',
  '543210',
  '654321',
  '765432',
  '876543',
  '987654',
  '123123',
  '321321',
  '112233',
  '121212',
  '123321',
  '101010',
  '010101',
  '135790',
  '147258',
  '159357',
])

const WEAK_9 = new Set<string>([
  '000000000',
  '111111111',
  '123456789',
  '987654321',
  '123123123',
  '321321321',
  '112233445',
  '123454321',
])

function isAllSameDigit(pin: string): boolean {
  return /^(\d)\1+$/.test(pin)
}

/** Dãy tăng/giảm liên tiếp theo modulo 10 (vd. 123456, 987654, 890123). */
function isMonotonicStep(pin: string, dir: 1 | -1): boolean {
  for (let i = 1; i < pin.length; i++) {
    const a = parseInt(pin[i - 1]!, 10)
    const b = parseInt(pin[i]!, 10)
    const diff = (b - a + 10) % 10
    if (dir === 1 && diff !== 1) return false
    if (dir === -1 && diff !== 9) return false
  }
  return true
}

function isSequentialOrReverse(pin: string): boolean {
  return isMonotonicStep(pin, 1) || isMonotonicStep(pin, -1)
}

/** Mẫu lặp dễ đoán: 123123, 121212, 123123123, … */
function isObviousRepeatPattern(pin: string): boolean {
  if (pin.length === 6) {
    if (pin.slice(0, 3) === pin.slice(3, 6)) return true
    if (/^(\d{2})\1\1$/.test(pin)) return true
  }
  if (pin.length === 9) {
    if (/^(\d{3})\1\1$/.test(pin)) return true
    if (pin.slice(0, 3) === pin.slice(3, 6) && pin.slice(3, 6) === pin.slice(6, 9)) return true
  }
  return false
}

/**
 * @returns Locale key nếu PIN yếu; `null` nếu chấp nhận được.
 * Chỉ gọi khi `pin` đã đúng 6 hoặc 9 chữ số.
 */
export function bookmarkPinWeakReason(pin: string): I18nKey | null {
  if (!/^\d{6}$/.test(pin) && !/^\d{9}$/.test(pin)) {
    return null
  }

  if (WEAK_6.has(pin) || WEAK_9.has(pin)) {
    return 'pinWeak.common'
  }

  if (isAllSameDigit(pin)) {
    return 'pinWeak.sameDigit'
  }

  if (isSequentialOrReverse(pin)) {
    return 'pinWeak.sequential'
  }

  if (isObviousRepeatPattern(pin)) {
    return 'pinWeak.pattern'
  }

  return null
}
