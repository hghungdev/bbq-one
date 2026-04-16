import type { BundledLanguage, BundledTheme, Highlighter } from 'shiki'

let highlighter: Highlighter | null = null

const THEME: BundledTheme = 'github-dark'
const LANGS: BundledLanguage[] = [
  'javascript',
  'typescript',
  'sql',
  'php',
  'bash',
  'python',
  'json',
  'html',
  'css',
  'markdown',
]

/** Lazy-load Shiki and return highlighted HTML (call from async contexts). */
export async function highlightCode(
  code: string,
  lang: string,
): Promise<string> {
  const safeLang = LANGS.includes(lang as BundledLanguage)
    ? (lang as BundledLanguage)
    : 'markdown'
  if (!highlighter) {
    const { createHighlighter } = await import('shiki')
    highlighter = await createHighlighter({
      themes: [THEME],
      langs: LANGS,
    })
  }
  try {
    return highlighter.codeToHtml(code, {
      lang: safeLang,
      theme: THEME,
    })
  } catch {
    return highlighter.codeToHtml(code, {
      lang: 'markdown',
      theme: THEME,
    })
  }
}
