import { supabase } from './supabase'
import type { BookmarkBackup, BookmarkGlobalHit, BookmarkNode } from '@/types/bookmark'

export const bookmarksService = {
  /** Đọc toàn bộ bookmark từ Chrome API */
  async getFromBrowser(): Promise<BookmarkNode[]> {
    return chrome.bookmarks.getTree() as unknown as BookmarkNode[]
  },

  /** Lấy danh sách backup từ Supabase (20 gần nhất) */
  async listBackups(): Promise<BookmarkBackup[]> {
    const { data, error } = await supabase
      .from('bookmark_backups')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    return data as BookmarkBackup[]
  },

  /** Lưu snapshot mới lên Supabase */
  async saveBackup(tree: BookmarkNode[], label?: string): Promise<BookmarkBackup> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const browserHint = navigator.userAgent.includes('Edg') ? 'edge'
      : navigator.userAgent.includes('Chrome') ? 'chrome' : 'other'

    const { data, error } = await supabase
      .from('bookmark_backups')
      .insert({
        user_id: user.id,
        label: label ?? new Date().toLocaleString('sv'), // "2026-04-17 14:30:00"
        tree_json: tree,
        browser_hint: browserHint,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data as BookmarkBackup
  },

  /** Xóa 1 backup */
  async deleteBackup(id: string): Promise<void> {
    const { error } = await supabase
      .from('bookmark_backups')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  /** Xóa toàn bộ bookmark hiện có (giữ các folder gốc của Chromium: bar / Other / Mobile — chỉ xóa con). */
  async deleteAllFromBrowser(): Promise<void> {
    await removeChildrenOfRootTopFolders()
  },

  /** Restore: ghi lại toàn bộ bookmark tree vào Chrome
   *  Chiến lược: xóa hết children của "Bookmarks bar" và "Other bookmarks", rồi import lại
   */
  async restoreToChrome(tree: BookmarkNode[]): Promise<void> {
    await removeChildrenOfRootTopFolders()
    // tree[0] = root "0", tree[0].children = [Bookmarks bar "1", Other "2", Mobile "3"]
    const root = tree[0]
    if (!root?.children) return

    for (const topFolder of root.children) {
      if (topFolder.children) {
        await importChildren(topFolder.id, topFolder.children)
      }
    }
  },

  /** Export ra file HTML (Netscape Bookmark Format) — compatible mọi browser */
  exportAsHTML(tree: BookmarkNode[]): void {
    const lines: string[] = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<!-- This is an automatically generated file. -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>Bookmarks</TITLE>',
      '<H1>Bookmarks</H1>',
      '<DL><p>',
    ]
    function walk(nodes: BookmarkNode[], indent = 1): void {
      const pad = '    '.repeat(indent)
      for (const n of nodes) {
        if (n.url) {
          lines.push(`${pad}<DT><A HREF="${n.url}">${escHtml(n.title)}</A>`)
        } else {
          lines.push(`${pad}<DT><H3>${escHtml(n.title)}</H3>`)
          lines.push(`${pad}<DL><p>`)
          if (n.children) walk(n.children, indent + 1)
          lines.push(`${pad}</DL><p>`)
        }
      }
    }
    const root = tree[0]
    if (root?.children) walk(root.children)
    lines.push('</DL><p>')
    const blob = new Blob([lines.join('\n')], { type: 'text/html' })
    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename: `bookmarks-${Date.now()}.html`,
    })
  },

  /** Lọc tree theo chuỗi (title + url), giữ cấu trúc thư mục nếu có nhánh khớp. */
  filterBookmarkTreeByQuery(nodes: BookmarkNode[], query: string): BookmarkNode[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return nodes

    function walk(n: BookmarkNode): BookmarkNode | null {
      if (n.url) {
        const hay = `${n.title}\t${n.url}`.toLowerCase()
        return hay.includes(needle) ? n : null
      }
      const kids = n.children
      const nextChildren: BookmarkNode[] = []
      if (kids?.length) {
        for (const c of kids) {
          const w = walk(c)
          if (w) nextChildren.push(w)
        }
      }
      const folderTitleHit = n.title.toLowerCase().includes(needle)
      if (folderTitleHit || nextChildren.length > 0) {
        return { ...n, children: nextChildren }
      }
      return null
    }

    const out: BookmarkNode[] = []
    for (const node of nodes) {
      const w = walk(node)
      if (w) out.push(w)
    }
    return out
  },

  /**
   * Tìm kiếm toàn cục: gom mọi URL bookmark trong LIVE + từng bản backup (tree JSON),
   * khớp theo path / title / url (không phân biệt hoa thường).
   */
  searchBookmarkGlobalHits(
    query: string,
    liveTree: BookmarkNode[],
    backups: BookmarkBackup[],
  ): BookmarkGlobalHit[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return []

    function rowMatches(path: string, title: string, url: string): boolean {
      const hay = `${path}\t${title}\t${url}`.toLowerCase()
      return hay.includes(needle)
    }

    const out: BookmarkGlobalHit[] = []

    function pushFromRows(
      rows: { id: string; title: string; url: string; path: string }[],
      sourceKey: 'live' | string,
      sourceLabel: string,
    ): void {
      for (const r of rows) {
        if (rowMatches(r.path, r.title, r.url)) {
          out.push({
            sourceKey,
            sourceLabel,
            id: r.id,
            title: r.title,
            url: r.url,
            path: r.path,
          })
        }
      }
    }

    pushFromRows(
      flattenBookmarkUrls(liveTree),
      'live',
      'LIVE BROWSER',
    )
    for (const bk of backups) {
      pushFromRows(
        flattenBookmarkUrls(bk.tree_json),
        bk.id,
        `BACKUP · ${bk.label}`,
      )
    }

    return out
  },
}

/** Xóa hết node con dưới các folder cấp 1 (Bookmarks bar, Other bookmarks, …). */
async function removeChildrenOfRootTopFolders(): Promise<void> {
  const tree = (await chrome.bookmarks.getTree()) as unknown as BookmarkNode[]
  const root = tree[0]
  if (!root?.children) return
  for (const topFolder of root.children) {
    const existing = await chrome.bookmarks.getChildren(topFolder.id).catch(() => [])
    for (const child of existing) {
      await chrome.bookmarks.removeTree(child.id).catch(() => {})
    }
  }
}

// Helper: đệ quy import children
async function importChildren(parentId: string, nodes: BookmarkNode[]): Promise<void> {
  for (const node of nodes) {
    if (node.url) {
      await chrome.bookmarks.create({ parentId, title: node.title, url: node.url })
    } else {
      const created = await chrome.bookmarks.create({ parentId, title: node.title })
      if (node.children) await importChildren(created.id, node.children)
    }
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Gom mọi node có URL kèm đường dẫn thư mục (để search global). */
function flattenBookmarkUrls(nodes: BookmarkNode[]): { id: string; title: string; url: string; path: string }[] {
  const acc: { id: string; title: string; url: string; path: string }[] = []

  function walk(list: BookmarkNode[], parentPath: string): void {
    for (const n of list) {
      const seg = (n.title ?? '').trim() || '(no name)'
      const path = parentPath ? `${parentPath} > ${seg}` : seg
      if (n.url) {
        acc.push({
          id: n.id,
          title: (n.title ?? '').trim() || n.url,
          url: n.url,
          path,
        })
      }
      if (n.children?.length) walk(n.children, path)
    }
  }

  walk(nodes, '')
  return acc
}
