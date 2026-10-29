import type { Folder, Note, NoteBody } from '@/types'
import { isEncryptedEnvelope } from '@/utils/secureCrypto'

/**
 * F1: tìm ghi chú từ thanh địa chỉ (`bbq …`) — logic thuần, chạy trong service worker (KHÔNG có `document`).
 * Enter mở BBQOne đúng ghi chú, Alt+Enter sao chép cả ghi chú (`background.ts`).
 */

export const OMNIBOX_MAX_SUGGESTIONS = 5

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Giải mã entity một lượt (không giải mã hai lần: `&amp;lt;` → `&lt;`). */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[ref.toLowerCase()] ?? whole
  })
}

/**
 * HTML ghi chú (Tiptap) → chữ, không cần DOM. Khối → xuống dòng; trong `<pre>` giữ nguyên xuống dòng, khoảng trắng,
 * thụt lề (code / SQL dán ra vẫn đúng); dòng trống thừa giữa các khối bị bỏ.
 */
export function htmlToTextNoDom(html: string): string {
  // Trong <pre>: tạm thay \n / dấu cách / tab bằng ký tự riêng để bước gộp khoảng trắng không đụng tới.
  const protectedHtml = html.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_m, inner: string) =>
    `\n${inner.replace(/\n/g, '\u0001').replace(/ /g, '\u0002').replace(/\t/g, '\u0003')}\n`,
  )
  const text = decodeEntities(
    protectedHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|blockquote|h[1-6]|tr)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/\u0001/g, '\n')
    .replace(/\u0002/g, ' ')
    .replace(/\u0003/g, '\t')
    .trim()
}

/** Chữ để sao chép CẢ ghi chú: mọi section theo `position`, cách nhau một dòng trống; bỏ section rỗng. */
export function noteCopyText(bodies: readonly NoteBody[]): string {
  return bodies
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((b) => htmlToTextNoDom(b.content))
    .filter((t) => t.length > 0)
    .join('\n\n')
}

export interface OmniboxHit {
  note: Note
  /** Đoạn chữ quanh chỗ khớp (hoặc đầu nội dung khi khớp tên). */
  snippet: string
  titleMatch: boolean
}

/** Chữ một dòng của các section (nhớ theo object body — dữ liệu nằm trong bộ nhớ SW giữa các lần gõ). */
const searchTextCache = new WeakMap<object, { html: string; text: string }>()
function bodyLineText(body: NoteBody): string {
  const hit = searchTextCache.get(body)
  if (hit && hit.html === body.content) return hit.text
  const text = htmlToTextNoDom(body.content).replace(/\s+/g, ' ')
  searchTextCache.set(body, { html: body.content, text })
  return text
}

/** Đoạn trích quanh chỗ khớp `q`; `q` null (khớp tên) hoặc không thấy → đầu nội dung. */
function snippetAround(text: string, q: string | null, max = 80): string {
  if (text.length <= max) return text
  const idx = q ? text.toLowerCase().indexOf(q) : -1
  if (idx === -1) return `${text.slice(0, max).trimEnd()}…`
  const start = Math.max(0, idx - 30)
  const end = Math.min(text.length, start + max)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * Lọc + xếp: khớp tên / thẻ / nhãn / chữ trong body (như P4 — không khớp thẻ HTML); bỏ ghi chú thư mục bảo mật và
 * ghi chú còn khóa (envelope mã hóa). Khớp tên trước, rồi mới sửa trước.
 */
export function searchNotesForOmnibox(input: {
  notes: readonly Note[]
  bodies: readonly NoteBody[]
  folders: readonly Pick<Folder, 'id' | 'is_secure'>[]
  query: string
  limit?: number
}): OmniboxHit[] {
  const q = input.query.trim().toLowerCase()
  if (!q) return []
  const secure = new Set(input.folders.filter((f) => f.is_secure).map((f) => f.id))
  const byNote = new Map<string, NoteBody[]>()
  for (const b of input.bodies) {
    const list = byNote.get(b.note_id)
    if (list) list.push(b)
    else byNote.set(b.note_id, [b])
  }
  const hits: OmniboxHit[] = []
  for (const n of input.notes) {
    if (n.folder_id && secure.has(n.folder_id)) continue
    const bs = (byNote.get(n.id) ?? []).slice().sort((a, b) => a.position - b.position)
    if (isEncryptedEnvelope(n.title) || bs.some((b) => isEncryptedEnvelope(b.content) || isEncryptedEnvelope(b.label))) continue
    const text = bs.map(bodyLineText).filter(Boolean).join(' ')
    const titleMatch = n.title.toLowerCase().includes(q)
    const otherMatch =
      n.tags.some((t) => t.toLowerCase().includes(q)) ||
      bs.some((b) => b.label.toLowerCase().includes(q)) ||
      text.toLowerCase().includes(q)
    if (!titleMatch && !otherMatch) continue
    hits.push({ note: n, snippet: snippetAround(text, titleMatch ? null : q), titleMatch })
  }
  hits.sort(
    (a, b) =>
      Number(b.titleMatch) - Number(a.titleMatch) ||
      Date.parse(b.note.updated_at) - Date.parse(a.note.updated_at),
  )
  return hits.slice(0, input.limit ?? OMNIBOX_MAX_SUGGESTIONS)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Escape + bọc `<match>` quanh mọi chỗ khớp (không phân biệt hoa thường). */
function markMatches(text: string, query: string): string {
  const q = query.trim().toLowerCase()
  if (!q) return escapeXml(text)
  const lower = text.toLowerCase()
  let out = ''
  let i = 0
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, i)) {
    out += `${escapeXml(text.slice(i, at))}<match>${escapeXml(text.slice(at, at + q.length))}</match>`
    i = at + q.length
  }
  return out + escapeXml(text.slice(i))
}

/** Dòng gợi ý của Chrome (XML): `Tên — Thư mục · …đoạn trích…`, chữ khớp trong tên in đậm, phần sau làm mờ. */
export function omniboxDescription(
  hit: OmniboxHit,
  folderName: string | null,
  query: string,
  untitled: string,
): string {
  const title = hit.note.title.trim() || untitled
  const meta = [folderName, hit.snippet].filter((s): s is string => !!s && s.trim().length > 0)
  const dim = meta.length > 0 ? ` <dim>— ${escapeXml(meta.join(' · '))}</dim>` : ''
  return `${markMatches(title, query)}${dim}`
}

/** `content` của gợi ý — chữ hiện trên thanh địa chỉ khi chọn, kèm mã nhận lại ghi chú: `Tên #<8 ký tự đầu id>`. */
export function omniboxContent(note: Note, untitled: string): string {
  return `${note.title.trim() || untitled} #${note.id.slice(0, 8)}`
}

/** Nhận lại ghi chú từ `content`; chữ người dùng tự gõ (không có mã khớp đúng một ghi chú) → null. */
export function resolveOmniboxNoteId(text: string, notes: readonly Note[]): string | null {
  const m = /#([0-9a-f]{8})\s*$/i.exec(text)
  if (!m) return null
  const prefix = m[1].toLowerCase()
  const found = notes.filter((n) => n.id.toLowerCase().startsWith(prefix))
  return found.length === 1 ? found[0].id : null
}

/** Route mở popup đúng ghi chú / với ô tìm điền sẵn (`pages/App.vue` đọc rồi xóa query). */
export function omniboxNoteRoute(noteId: string): string {
  return `/dashboard?note=${encodeURIComponent(noteId)}`
}

export function omniboxSearchRoute(query: string): string {
  return `/dashboard?q=${encodeURIComponent(query)}`
}
