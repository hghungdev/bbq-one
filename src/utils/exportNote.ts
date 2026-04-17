import type { Note, NoteBody } from '@/types'
import { noteListLabel } from '@/utils/text'

function stripHtml(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent ?? tmp.innerText ?? ''
}

function sanitizeFilename(s: string): string {
  const t = s.trim() || 'note'
  return t.replace(/[^a-z0-9_\-\.]/gi, '_').slice(0, 80)
}

function bodyLabelForExport(b: NoteBody): string {
  const t = b.label.trim()
  if (t) return t
  const plain = stripHtml(b.content).replace(/\s+/g, ' ').trim()
  const line = plain.split('\n')[0]?.trim() ?? ''
  return line.slice(0, 60) || 'BODY'
}

/** Download note (mọi body) dưới dạng .txt (user gesture trong popup). */
export function downloadNoteAsTxt(note: Note, bodies: NoteBody[]): void {
  const title =
    noteListLabel(note, bodies).replace(/_+$/, '') || 'UNTITLED'
  const sorted = bodies
    .slice()
    .sort((a, b) => a.position - b.position)
  const parts: string[] = [`${title}`, '']
  for (const b of sorted) {
    const head = `--- ${bodyLabelForExport(b)} ---`
    parts.push(head, '', stripHtml(b.content), '')
  }
  const text = parts.join('\n')
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFilename(title)}.txt`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}
