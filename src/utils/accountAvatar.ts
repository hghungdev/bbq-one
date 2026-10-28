/**
 * U22: chữ trên avatar tài khoản (kiểu Gmail) — chữ / số đầu tiên của email, viết hoa.
 * Không có chữ nào (rỗng / null / chỉ ký hiệu) → '' — nơi gọi hiện icon 👤 thay thế.
 */
export function avatarInitial(email: string | null | undefined): string {
  const m = /[\p{L}\p{N}]/u.exec(email ?? '')
  return m ? m[0].toLocaleUpperCase() : ''
}
