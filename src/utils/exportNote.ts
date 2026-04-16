import type { Note } from '@/types'
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

/** Download active note as .txt (user gesture in popup). */
export function downloadNoteAsTxt(note: Note): void {
  const title = noteListLabel(note).replace(/_+$/, '') || 'UNTITLED'
  const body = stripHtml(note.content)
  const text = `${title}\n\n${body}`
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFilename(title)}.txt`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}
