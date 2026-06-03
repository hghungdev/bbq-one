import { describe, expect, it } from 'vitest'
import {
  isInternalNoteClipboardHtml,
  noteHtmlNeedsPlainSanitize,
  plainTextToNoteHtml,
  sanitizeHtmlToNoteContent,
} from '@/utils/pastePlainText'

describe('pastePlainText', () => {
  it('detects inline styles from web paste', () => {
    expect(noteHtmlNeedsPlainSanitize('<p>ok</p>')).toBe(false)
    expect(noteHtmlNeedsPlainSanitize('<p style="color:red">x</p>')).toBe(true)
  })

  it('detects internal BBQOne clipboard', () => {
    expect(isInternalNoteClipboardHtml('<pre class="retro-code-block"><code>a</code></pre>')).toBe(true)
    expect(isInternalNoteClipboardHtml('<p style="color:red">x</p>')).toBe(false)
  })

  it('preserves pre as code block when sanitizing', () => {
    const out = sanitizeHtmlToNoteContent(
      '<div><p style="color:blue">intro</p><pre><code class="language-ts">const x = 1</code></pre></div>',
    )
    expect(out).toContain('retro-code-block')
    expect(out).toContain('const x = 1')
    expect(out).toContain('<p>intro</p>')
    expect(out).not.toContain('style=')
  })

  it('converts fenced plain text to code block', () => {
    const out = plainTextToNoteHtml('hello\n```js\nconsole.log(1)\n```\nbye')
    expect(out).toContain('retro-code-block')
    expect(out).toContain('console.log(1)')
    expect(out).toContain('<p>hello</p>')
    expect(out).toContain('<p>bye</p>')
  })

  it('flattens styled prose without pre to paragraphs', () => {
    const out = sanitizeHtmlToNoteContent(
      '<p><span style="color: rgb(0,0,255)">Hello</span></p>',
    )
    expect(out).toBe('<p>Hello</p>')
  })
})
