import type { BookmarkNode } from '@/types/bookmark'

/**
 * SEC-4: danh sách trắng scheme cho link bookmark tạo vào Chrome / nạp từ file. `javascript:`, `data:`, `vbscript:`,
 * `chrome:`… bị bỏ — bookmark `javascript:` chạy mã trên trang đang mở khi bấm (kẻ chiếm tài khoản cài vào bản sao lưu
 * → nạn nhân khôi phục).
 */
const SAFE_BOOKMARK_URL = /^(https?|ftp|file):/i

export function isSafeBookmarkUrl(url: string): boolean {
  return SAFE_BOOKMARK_URL.test(url.trim())
}

/** Cây mới (không sửa cây gốc): giữ thư mục, bỏ nút có link không an toàn. */
export function filterUnsafeBookmarks(nodes: readonly BookmarkNode[]): { tree: BookmarkNode[]; skipped: number } {
  let skipped = 0
  const walk = (list: readonly BookmarkNode[]): BookmarkNode[] =>
    list.flatMap((n) => {
      if (n.url !== undefined && !isSafeBookmarkUrl(n.url)) {
        skipped++
        return []
      }
      return [n.children ? { ...n, children: walk(n.children) } : { ...n }]
    })
  const tree = walk(nodes)
  return { tree, skipped }
}

export function countUnsafeBookmarks(nodes: readonly BookmarkNode[]): number {
  return filterUnsafeBookmarks(nodes).skipped
}
