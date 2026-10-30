import { supabase } from './supabase'

/**
 * S2: xác thực 2 bước TOTP (tùy chọn). Phiên `aal1` của tài khoản đã có factor xác minh = CHƯA đăng nhập xong — máy chủ
 * cũng chặn (policy RESTRICTIVE `mfa_aal2_if_enrolled`, migration 019).
 */
export interface TotpEnrollment {
  factorId: string
  /** `data:image/svg+xml…` — CSP `img-src 'self' data:` cho phép. */
  qrCode: string
  /** Chuỗi bí mật — nhập tay vào app xác thực; lưu nơi an toàn = cách thêm lại khi mất điện thoại. */
  secret: string
}

/**
 * supabase-js ghép `data:image/svg+xml;utf-8,` + SVG THÔ (chưa mã hóa) — ký tự `#` (màu) trong SVG cắt data URL thành
 * fragment → ảnh hỏng. Mã hóa lại phần SVG.
 */
function svgDataUrl(qr: string): string {
  const svg = qr.replace(/^data:image\/svg\+xml;[^,]*,/, '')
  return svg.trimStart().startsWith('<') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : qr
}

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback)
}

export const mfaService = {
  /** Có factor đã xác minh mà phiên mới aal1. Không truyền JWT → chỉ đọc phiên đã lưu, KHÔNG gọi mạng (dùng được trong SW). */
  async isPending(): Promise<boolean> {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error || !data) return false
      return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
    } catch {
      return false
    }
  },

  /** `aal` của phiên đã lưu ('aal1' | 'aal2' | null) — không gọi mạng. */
  async currentLevel(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      return data?.currentLevel ?? null
    } catch {
      return null
    }
  },

  /** Factor TOTP đã xác minh (gọi máy chủ — thấy cả 2FA vừa bật ở máy khác). */
  async listVerifiedTotp(): Promise<{ id: string }[]> {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error || !data) fail(error, 'Could not load 2-step verification status')
    return data.totp.map((f) => ({ id: f.id }))
  },

  async verify(code: string, factorId?: string): Promise<void> {
    const id = factorId ?? (await mfaService.listVerifiedTotp())[0]?.id
    if (!id) throw new Error('No verified authenticator')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() })
    if (error) fail(error, 'Invalid code')
  },

  async enrollTotp(): Promise<TotpEnrollment> {
    // Lần bật trước bỏ dở để lại factor chưa xác minh → gỡ trước (không để rác, không vướng trùng tên).
    const { data: list } = await supabase.auth.mfa.listFactors()
    for (const f of list?.all ?? []) {
      if (f.factor_type === 'totp' && f.status !== 'verified') await mfaService.unenroll(f.id)
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `BBQOne ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    })
    if (error || !data) fail(error, 'Could not start 2-step verification')
    return { factorId: data.id, qrCode: svgDataUrl(data.totp.qr_code), secret: data.totp.secret }
  },

  async unenroll(factorId: string): Promise<void> {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) fail(error, 'Could not remove authenticator')
  },
}
