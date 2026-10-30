import type { LangCode } from '@/stores/uiLang'

/** S11: chữ phải gõ trước khi "Xóa tất cả bookmark" — không dấu để gõ được trên mọi bàn phím. */
export function deleteAllWord(lang: LangCode): string {
  return lang === 'vi' ? 'XOA' : 'DELETE'
}

/** Bỏ dấu (XÓA → XOA), bỏ mọi khoảng trắng, không phân biệt hoa thường. */
export function isDeleteAllWordTyped(input: string, lang: LangCode): boolean {
  const norm = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
  return norm === deleteAllWord(lang)
}
