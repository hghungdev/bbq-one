import type { HighlighterCore } from 'shiki/core'

/** Promise dùng chung — nhiều code block mở cùng lúc không tạo highlighter trùng (P2). */
let highlighter: Promise<HighlighterCore> | null = null

const THEMES_LIGHT = 'github-light'
const THEMES_DARK = 'github-dark'
/**
 * P2: import riêng từng ngôn ngữ thay vì nạp cả bộ Shiki (~200 ngôn ngữ + ~60 theme → 280+ file trong
 * gói). Ngôn ngữ nhúng (html → css/javascript, php → sql/json…) do chính file ngôn ngữ kéo theo.
 */
const LANG_LOADERS = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
}
type Lang = keyof typeof LANG_LOADERS
const LANGS = Object.keys(LANG_LOADERS) as Lang[]

function bundledThemeForDocument(): string {
  if (typeof document === 'undefined') return THEMES_DARK
  return document.documentElement.dataset.theme === 'dark' ? THEMES_DARK : THEMES_LIGHT
}

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createOnigurumaEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/oniguruma'),
    ])
    // Cùng engine WASM (Oniguruma) như bundle đầy đủ → HTML tô màu không đổi.
    return createHighlighterCore({
      themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
      langs: Object.values(LANG_LOADERS).map((load) => load()),
      engine: createOnigurumaEngine(import('shiki/wasm')),
    })
  })().catch((e: unknown) => {
    highlighter = null // lỗi nạp (vd chunk hỏng) → lần sau thử lại, không kẹt Promise reject mãi
    throw e
  })
  return highlighter
}

/** Lazy-load Shiki and return highlighted HTML (call from async contexts). */
export async function highlightCode(
  code: string,
  lang: string,
): Promise<string> {
  const theme = bundledThemeForDocument()
  const safeLang: Lang = LANGS.includes(lang as Lang) ? (lang as Lang) : 'markdown'
  const h = await getHighlighter()
  try {
    return h.codeToHtml(code, {
      lang: safeLang,
      theme,
    })
  } catch {
    return h.codeToHtml(code, {
      lang: 'markdown',
      theme,
    })
  }
}
