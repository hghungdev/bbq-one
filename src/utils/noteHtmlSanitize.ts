import { getSchema } from '@tiptap/core'
import { DOMParser as PmDOMParser, DOMSerializer } from '@tiptap/pm/model'
import { noteEditorExtensions } from '@/utils/noteEditorExtensions'
import { htmlToTextNoDom } from '@/utils/omniboxNotes'

/**
 * B1: lọc HTML ghi chú từ file sao lưu (dữ liệu ngoài) — đi qua đúng schema của trình soạn (như `generateJSON` +
 * `generateHTML` của Tiptap, nhưng dựng schema MỘT lần: 4.000 section không dựng lại 4.000 lần).
 * Chỉ còn đoạn văn, tiêu đề, danh sách, trích dẫn, code, in đậm / nghiêng / gạch, xuống dòng, đường kẻ; mọi thứ
 * khác (script, style, ảnh, iframe, form, link, thuộc tính on* / style / src…) bị bỏ. Phân tích bằng DOMParser của
 * trình duyệt → tài liệu trơ (không tải tài nguyên, không chạy mã). Lỗi bất kỳ → chỉ giữ chữ thuần (đã escape).
 */
let tools: { parser: PmDOMParser; serializer: DOMSerializer; doc: Document } | null = null

function getTools(): NonNullable<typeof tools> {
  if (!tools) {
    const schema = getSchema(noteEditorExtensions())
    tools = {
      parser: PmDOMParser.fromSchema(schema),
      serializer: DOMSerializer.fromSchema(schema),
      doc: document.implementation.createHTMLDocument(''),
    }
  }
  return tools
}

export function sanitizeNoteHtml(html: string): string {
  try {
    const { parser, serializer, doc } = getTools()
    const inert = new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body
    const node = parser.parse(inert)
    const out = doc.createElement('div')
    out.appendChild(serializer.serializeFragment(node.content, { document: doc }))
    return out.innerHTML
  } catch {
    return plainTextParagraphs(htmlToTextNoDom(html))
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function plainTextParagraphs(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  return lines.length ? lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('') : '<p></p>'
}
