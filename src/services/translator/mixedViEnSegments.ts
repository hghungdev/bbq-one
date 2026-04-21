import type { LangCode } from '@/types/dictionary'

/** Ký tự gốc tiếng Việt (Latin mở rộng) — dùng phân tách đoạn EN / VN trong cùng một câu. */
const VI_CHARS =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

/**
 * Token Latin (ASCII) coi là tiếng Anh / loanword khi đích là tiếng Việt.
 * Cho phép compound (state-of-the-art), apostrophe (don't), dấu câu đuôi (pattern,).
 */
const LATINISH_FOR_VI_TARGET = /^[a-zA-Z](?:[a-zA-Z'-.])*[a-zA-Z0-9]?[.,!?;:)]*$|^[a-zA-Z][.,!?;:)]$/

export function hasVietnameseMark(s: string): boolean {
  return VI_CHARS.test(s)
}

function isWhitespaceToken(s: string): boolean {
  return /^\s+$/.test(s)
}

/**
 * Phân loại token (một "từ" sau khi tách khoảng trắng) khi ngôn đích là tiếng Việt:
 * - Giữ nguyên: có dấu tiếng Việt, số, ký tự đặc biệt, từ viết tắt IN HOA ngắn, hoặc 1 chữ cái Latin đơn lẻ.
 * - Dịch (coi là EN): cụm chữ Latin không dấu VN.
 */
export function classifyTokenForTargetVi(token: string): 'keep' | 'translate' {
  const t = token.trim()
  if (!t) return 'keep'
  if (hasVietnameseMark(token)) return 'keep'
  if (/^\d+$/.test(t)) return 'keep'
  if (/^[0-9]+[.,][0-9]+$/.test(t)) return 'keep'
  if (!/[a-zA-Z]/.test(token)) return 'keep'
  if (/^[A-Z]{2,5}$/.test(t)) return 'keep'
  if (/^[a-zA-Z]$/.test(t)) return 'keep'
  if (LATINISH_FOR_VI_TARGET.test(t)) return 'translate'
  return 'keep'
}

/**
 * Ngược lại: ngôn đích tiếng Anh — đoạn có dấu VN cần dịch, còn lại giữ.
 */
export function classifyTokenForTargetEn(token: string): 'keep' | 'translate' {
  const t = token.trim()
  if (!t) return 'keep'
  if (isWhitespaceToken(token)) return 'keep'
  if (hasVietnameseMark(token)) return 'translate'
  return 'keep'
}

function classifyToken(token: string, targetLang: LangCode): 'keep' | 'translate' {
  if (targetLang === 'vi') return classifyTokenForTargetVi(token)
  if (targetLang === 'en') return classifyTokenForTargetEn(token)
  return 'keep'
}

export interface MixedRun {
  action: 'keep' | 'translate'
  /** Khi action === translate: mã nguồn cho Chrome Translator */
  sourceLang?: LangCode
  text: string
}

function flushRun(runs: MixedRun[], current: MixedRun | null): void {
  if (current && current.text.length > 0) runs.push(current)
}

/**
 * Tách chuỗi thành các run liên tiếp (giữ nguyên / cần dịch), bảo toàn khoảng trắng giữa các phần.
 * Chỉ dùng khi targetLang là vi hoặc en.
 */
export function buildMixedRuns(text: string, targetLang: LangCode): MixedRun[] {
  if (targetLang !== 'vi' && targetLang !== 'en') {
    return [{ action: 'keep', text }]
  }

  const parts = text.split(/(\s+)/)
  const runs: MixedRun[] = []
  let current: MixedRun | null = null

  for (const part of parts) {
    if (part === '') continue

    if (isWhitespaceToken(part)) {
      if (current) current.text += part
      else current = { action: 'keep', text: part }
      continue
    }

    const action = classifyToken(part, targetLang)
    const sourceLang: LangCode | undefined =
      action === 'translate' ? (targetLang === 'vi' ? 'en' : 'vi') : undefined

    const canExtend =
      current !== null &&
      current.action === action &&
      (action === 'keep' || current.sourceLang === sourceLang)

    if (canExtend && current) {
      current.text += part
    } else {
      flushRun(runs, current)
      current =
        action === 'translate' && sourceLang
          ? { action: 'translate', sourceLang, text: part }
          : { action: 'keep', text: part }
    }
  }

  flushRun(runs, current)
  return runs.length > 0 ? runs : [{ action: 'keep', text }]
}

export function mixedRunsNeedTranslation(runs: MixedRun[]): boolean {
  return runs.some((r) => r.action === 'translate')
}

/**
 * Kiểm tra bản dịch cả câu (en→vi) có giữ nguyên các mảnh tiếng Việt đã xác định trong `runs` hay không.
 * Tránh chấp nhận output làm biến dạng phần VN khi model xử lý sai câu lẫn ngôn ngữ.
 */
export function vietnameseKeepsIntactInTranslation(runs: MixedRun[], translated: string): boolean {
  const out = translated.normalize('NFC')
  for (const r of runs) {
    if (r.action !== 'keep') continue
    if (!hasVietnameseMark(r.text)) continue
    const pieces = r.text.split(/\s+/).filter((p) => p.length > 0 && hasVietnameseMark(p))
    if (pieces.length === 0) {
      const t = r.text.trim()
      if (t.length > 0 && !out.includes(t.normalize('NFC'))) return false
      continue
    }
    for (const p of pieces) {
      if (!out.includes(p.normalize('NFC'))) return false
    }
  }
  return true
}
