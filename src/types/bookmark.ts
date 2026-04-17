/** Node trả về từ chrome.bookmarks.getTree() */
export interface BookmarkNode {
  id: string
  parentId?: string
  index?: number
  url?: string          // undefined nếu là folder
  title: string
  dateAdded?: number
  dateGroupModified?: number
  children?: BookmarkNode[]
}

/** 1 snapshot backup lưu trên Supabase */
export interface BookmarkBackup {
  id: string
  user_id: string
  label: string
  tree_json: BookmarkNode[]
  browser_hint: string
  created_at: string
}

/** Node đã flatten để render danh sách phẳng (tùy chọn dùng trong search) */
export interface FlatBookmark {
  id: string
  title: string
  url: string
  path: string          // "Bookmarks Bar > Dev > Tools"
  depth: number
}

/** 1 dòng kết quả tìm kiếm bookmark xuyên LIVE + mọi backup */
export interface BookmarkGlobalHit {
  sourceKey: 'live' | string
  sourceLabel: string
  id: string
  title: string
  url: string
  path: string
}
