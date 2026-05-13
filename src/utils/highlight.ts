import type { BundledLanguage, BundledTheme, Highlighter } from 'shiki'

let highlighter: Highlighter | null = null

const THEMES_LIGHT: BundledTheme = 'github-light'
const THEMES_DARK: BundledTheme = 'github-dark'
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

function bundledThemeForDocument(): BundledTheme {
  if (typeof document === 'undefined') return THEMES_DARK
  return document.documentElement.dataset.theme === 'dark' ? THEMES_DARK : THEMES_LIGHT
}

/** Lazy-load Shiki and return highlighted HTML (call from async contexts). */
export async function highlightCode(
  code: string,
  lang: string,
): Promise<string> {
  const theme = bundledThemeForDocument()
  const safeLang = LANGS.includes(lang as BundledLanguage)
    ? (lang as BundledLanguage)
    : 'markdown'
  if (!highlighter) {
    const { createHighlighter } = await import('shiki')
    highlighter = await createHighlighter({
      themes: [THEMES_LIGHT, THEMES_DARK],
      langs: LANGS,
    })
  }
  try {
    return highlighter.codeToHtml(code, {
      lang: safeLang,
      theme,
    })
  } catch {
    return highlighter.codeToHtml(code, {
      lang: 'markdown',
      theme,
    })
  }
}
