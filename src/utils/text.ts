import type { Note, NoteBody } from '@/types'

/** Plain text từ HTML (dùng trong extension, có document). */
export function plainTextFromHtml(html: string): string {
  if (typeof document === 'undefined') return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Plain text cho clipboard — giữ xuống dòng từ block (innerText). */
export function htmlToClipboardPlain(html: string): string {
  if (typeof document === 'undefined') return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.innerText ?? div.textContent ?? '').trim()
}

/** Dòng đầu của plain text (không xuống dòng trong chuỗi đã gộp space). */
export function firstLinePreview(text: string, maxLen = 80): string {
  const raw = text.trim()
  if (!raw) return ''
  const line = raw.split(/\n/)[0]?.trim() ?? ''
  return line.slice(0, maxLen)
}

/** Nhãn trong list: title nếu có, không thì preview từ body đầu tiên. */
export function noteListLabel(note: Note, bodies?: NoteBody[]): string {
  const t = note.title.trim()
  if (t) return t
  const firstBody = bodies
    ?.slice()
    .sort((a, b) => a.position - b.position)[0]
  const plain = plainTextFromHtml(firstBody?.content ?? '')
  const first = firstLinePreview(plain, 80)
  return first || 'UNTITLED_'
}

/** Kết quả search global: `Folder > tên note` (không folder → `—`). */
export function noteSearchPathLine(
  folderName: string | null,
  noteLabel: string,
): string {
  const folder = folderName?.trim() ? folderName.trim() : '—'
  return `${folder} > ${noteLabel}`
}

/** Escape text for safe insertion into HTML (except we wrap in mark). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Wrap occurrences of query in <mark class="search-hit"> (query already trimmed). */
export function highlightQueryHtml(text: string, query: string): string {
  const q = query.trim()
  if (!q) return escapeHtml(text)
  const escaped = escapeHtml(text)
  const re = new RegExp(`(${escapeRegExp(q)})`, 'gi')
  return escaped.replace(re, '<mark class="search-hit">$1</mark>')
}
