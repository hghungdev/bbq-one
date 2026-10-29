import StarterKit from '@tiptap/starter-kit'
import type { Extensions } from '@tiptap/core'

/**
 * Schema của trình soạn ghi chú — DÙNG CHUNG cho NoteEditor và bộ lọc HTML khi nạp file (B1), để thứ được nạp vào
 * đúng bằng thứ trình soạn hiển thị được (không lệch nhau khi ai đó thêm / bớt định dạng). Mỗi lần gọi trả bộ mới.
 */
export function noteEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: {
        HTMLAttributes: {
          class: 'retro-code-block',
        },
      },
    }),
  ]
}
