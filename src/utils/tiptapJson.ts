/** Walk Tiptap JSON and collect code block bodies (StarterKit codeBlock nodes). */
export function extractCodeBlocksFromDocJSON(
  doc: unknown,
): { lang: string; code: string }[] {
  const out: { lang: string; code: string }[] = []

  function walk(node: Record<string, unknown>): void {
    if (typeof node !== 'object' || node === null) return
    if (node.type === 'codeBlock') {
      const lang = String(
        (node.attrs as { language?: string } | undefined)?.language ?? 'plaintext',
      )
      const code = extractText(node)
      out.push({ lang, code })
      return
    }
    const content = node.content as unknown[] | undefined
    if (Array.isArray(content)) {
      for (const c of content) walk(c as Record<string, unknown>)
    }
  }

  if (doc && typeof doc === 'object' && 'content' in doc) {
    const docObj = doc as { content?: unknown[] }
    if (Array.isArray(docObj.content)) {
      for (const n of docObj.content) walk(n as Record<string, unknown>)
    }
  }
  return out
}

function extractText(node: Record<string, unknown>): string {
  if (node.type === 'text') return String((node as { text?: string }).text ?? '')
  const content = node.content as Record<string, unknown>[] | undefined
  if (!Array.isArray(content)) return ''
  return content.map((c) => extractText(c as Record<string, unknown>)).join('')
}
