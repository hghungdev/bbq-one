import type { BookmarkNode } from '@/types/bookmark'

/**
 * C15: `chrome.bookmarks.getTree()` bọc mọi thứ trong một nút gốc không tên (id `0`) → cây hiện "(no name)" ở đầu
 * và đường dẫn tìm kiếm bắt đầu bằng "(no name) > …". Chỉ dùng khi HIỂN THỊ — sao lưu / khôi phục / xuất giữ cây đủ.
 */
export function unwrapBookmarkRoot(nodes: BookmarkNode[]): BookmarkNode[] {
  if (nodes.length !== 1) return nodes
  const [only] = nodes
  if (only.url || (only.title ?? '').trim() || !only.children) return nodes
  return only.children
}
