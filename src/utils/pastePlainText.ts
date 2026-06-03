import { DOMParser as PMDOMParser } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function extractLangFromPre(pre: HTMLElement): string {
  const code = pre.querySelector('code')
  const cls = code?.className ?? pre.className ?? ''
  const m = cls.match(/language-([\w-]+)/i)
  return m?.[1] ?? ''
}

function codeToPreHtml(code: string, lang?: string): string {
  const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : ''
  return `<pre class="retro-code-block"><code${langClass}>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`
}

function linesToParagraphsHtml(lines: string[]): string {
  if (lines.length === 0) return ''
  return lines
    .map((line) => {
      if (!line.trim()) return '<p></p>'
      return `<p>${escapeHtml(line.trimEnd())}</p>`
    })
    .join('')
}

/** Plain text có fenced ```lang → paragraph + code block. */
export function plainTextToNoteHtml(plain: string): string {
  const normalized = plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!/```/.test(normalized)) {
    return linesToParagraphsHtml(normalized.split('\n')) || '<p></p>'
  }

  const parts: string[] = []
  const re = /```([^\n`]*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null = re.exec(normalized)
  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(linesToParagraphsHtml(normalized.slice(lastIndex, match.index).split('\n')))
    }
    parts.push(codeToPreHtml(match[2], match[1]?.trim() || undefined))
    lastIndex = re.lastIndex
    match = re.exec(normalized)
  }
  if (lastIndex < normalized.length) {
    parts.push(linesToParagraphsHtml(normalized.slice(lastIndex).split('\n')))
  }
  const joined = parts.filter(Boolean).join('')
  return joined || '<p></p>'
}

/** HTML từ web paste thường mang style= / font / mso- — cần làm sạch. */
export function noteHtmlNeedsPlainSanitize(html: string): boolean {
  return /\sstyle\s*=/i.test(html) || /<font\b/i.test(html) || /mso-/i.test(html)
}

/** Copy từ chính BBQOne — giữ format gốc (code block, bold, …). */
export function isInternalNoteClipboardHtml(html: string): boolean {
  return html.includes('retro-code-block')
}

/**
 * Gỡ CSS/class rác từ HTML ngoài — giữ `<pre>` thành code block, còn lại → `<p>`.
 */
export function sanitizeHtmlToNoteContent(html: string): string {
  if (typeof document === 'undefined') return '<p></p>'
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  const chunks: string[] = []

  function appendPre(el: HTMLElement): void {
    chunks.push(codeToPreHtml(el.textContent ?? '', extractLangFromPre(el)))
  }

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').trim()
      if (t) chunks.push(`<p>${escapeHtml(t)}</p>`)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'pre') {
      appendPre(el)
      return
    }
    if (tag === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre') {
      const t = el.textContent?.trim()
      if (t) chunks.push(`<p>${escapeHtml(t)}</p>`)
      return
    }

    const nestedPres = el.querySelectorAll('pre')
    if (nestedPres.length > 0 && tag !== 'pre') {
      for (const child of el.childNodes) {
        walk(child)
      }
      return
    }

    const blockish = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'article', 'section', 'td']
    if (blockish.includes(tag)) {
      const text = (el.innerText ?? '').replace(/\r\n/g, '\n')
      chunks.push(linesToParagraphsHtml(text.split('\n')))
      return
    }

    for (const child of el.childNodes) walk(child)
  }

  for (const child of wrap.childNodes) walk(child)
  const joined = chunks.filter(Boolean).join('')
  return joined || '<p></p>'
}

/** @deprecated — alias */
export function noteHtmlToPlainParagraphs(html: string): string {
  return sanitizeHtmlToNoteContent(html)
}

export function insertHtmlIntoEditor(view: EditorView, html: string): void {
  const { state, dispatch } = view
  const parser = PMDOMParser.fromSchema(state.schema)
  const dom = document.createElement('div')
  dom.innerHTML = html
  const slice = parser.parseSlice(dom, { preserveWhitespace: 'full' })
  dispatch(state.tr.replaceSelection(slice).scrollIntoView())
}

/** Chèn plain text — mỗi dòng một paragraph. */
export function insertPlainTextFromPaste(view: EditorView, raw: string): void {
  insertHtmlIntoEditor(view, plainTextToNoteHtml(raw))
}

/**
 * Paste thông minh:
 * - Nội bộ BBQOne → default (giữ format)
 * - Có ``` hoặc `<pre>` → code block
 * - HTML style rác từ web → plain text
 */
export function handleNoteEditorPaste(view: EditorView, event: ClipboardEvent): boolean {
  const cd = event.clipboardData
  if (!cd) return false

  const html = cd.getData('text/html').trim()
  const plain = cd.getData('text/plain')

  if (html && isInternalNoteClipboardHtml(html)) {
    return false
  }

  if (plain && /```[\s\S]*?```/.test(plain)) {
    event.preventDefault()
    insertHtmlIntoEditor(view, plainTextToNoteHtml(plain))
    return true
  }

  if (html && /<pre[\s>]/i.test(html)) {
    event.preventDefault()
    insertHtmlIntoEditor(view, sanitizeHtmlToNoteContent(html))
    return true
  }

  if (html && noteHtmlNeedsPlainSanitize(html)) {
    event.preventDefault()
    if (plain !== '') insertPlainTextFromPaste(view, plain)
    return true
  }

  if (html && plain !== '') {
    event.preventDefault()
    insertHtmlIntoEditor(view, sanitizeHtmlToNoteContent(html))
    return true
  }

  if (plain !== '') {
    event.preventDefault()
    insertPlainTextFromPaste(view, plain)
    return true
  }

  return false
}
