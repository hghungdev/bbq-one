import { supabase } from './supabase'
import { fetchBookmarkCryptoRow } from '@/services/bookmarkCryptoKeys.service'
import { hashBookmarkTree, setPersistedBookmarkTreeHash } from '@/utils/bookmarkFingerprint'
import { decryptBookmarkTree, encryptBookmarkTree } from '@/utils/bookmarkCrypto'
import { getBookmarkCryptoKeyFromSession } from '@/utils/bookmarkSessionKey'
import type { BookmarkBackup, BookmarkGlobalHit, BookmarkNode } from '@/types/bookmark'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { localBookmarksService } from '@/services/localFirst/localBookmarks.service'

/** Hàng raw từ Supabase (sau migration PIN). */
interface BookmarkBackupRow {
  id: string
  user_id: string
  label: string
  tree_json: BookmarkNode[] | null
  encrypted: boolean
  payload_iv: string | null
  payload_ciphertext: string | null
  browser_hint: string
  created_at: string
}

export const bookmarksService = {
  /** Đọc toàn bộ bookmark từ Chrome API */
  async getFromBrowser(): Promise<BookmarkNode[]> {
    return chrome.bookmarks.getTree() as unknown as BookmarkNode[]
  },

  /** Lấy danh sách backup từ Supabase (20 gần nhất) hoặc local storage khi chưa đăng nhập */
  async listBackups(): Promise<BookmarkBackup[]> {
    if (!(await isAuthenticated())) {
      const localBackups = await localBookmarksService.listBackups()
      return localBackups.map((b) => ({ ...b, user_id: '' }) as BookmarkBackup)
    }

    const { data: rows, error } = await supabase
      .from('bookmark_backups')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    if (!rows?.length) return []

    const cryptoRow = await fetchBookmarkCryptoRow()
    const sessionKey = await getBookmarkCryptoKeyFromSession()
    if (cryptoRow && !sessionKey) {
      throw new Error('PIN bookmark chưa được mở khóa. Nhập PIN để xem backup.')
    }

    const out: BookmarkBackup[] = []
    for (const raw of rows as BookmarkBackupRow[]) {
      if (!raw.encrypted) {
        out.push({
          id: raw.id,
          user_id: raw.user_id,
          label: raw.label,
          tree_json: (raw.tree_json ?? []) as BookmarkNode[],
          browser_hint: raw.browser_hint,
          created_at: raw.created_at,
          encrypted: false,
        })
        continue
      }
      if (!sessionKey || !raw.payload_iv || !raw.payload_ciphertext) {
        throw new Error('Backup mã hóa cần PIN đã mở khóa.')
      }
      const tree = await decryptBookmarkTree(raw.payload_iv, raw.payload_ciphertext, sessionKey)
      out.push({
        id: raw.id,
        user_id: raw.user_id,
        label: raw.label,
        tree_json: tree,
        browser_hint: raw.browser_hint,
        created_at: raw.created_at,
        encrypted: true,
      })
    }
    return out
  },

  /** Lưu snapshot lên Supabase (logged in) hoặc local storage (anonymous) */
  async saveBackup(tree: BookmarkNode[], label?: string): Promise<BookmarkBackup> {
    if (!(await isAuthenticated())) {
      const local = await localBookmarksService.saveBackup(tree, label)
      return { ...local, user_id: '' } as BookmarkBackup
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const browserHint = navigator.userAgent.includes('Edg') ? 'edge'
      : navigator.userAgent.includes('Chrome') ? 'chrome' : 'other'

    const cryptoRow = await fetchBookmarkCryptoRow()
    const sessionKey = await getBookmarkCryptoKeyFromSession()

    if (cryptoRow) {
      if (!sessionKey) {
        throw new Error('Mở khóa PIN bookmark để tạo backup.')
      }
      const { ivB64, ctB64 } = await encryptBookmarkTree(tree, sessionKey)
      const { data, error } = await supabase
        .from('bookmark_backups')
        .insert({
          user_id: user.id,
          label: label ?? new Date().toLocaleString('sv'),
          tree_json: null,
          encrypted: true,
          payload_iv: ivB64,
          payload_ciphertext: ctB64,
          browser_hint: browserHint,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await setPersistedBookmarkTreeHash(await hashBookmarkTree(tree))
      return {
        id: data.id,
        user_id: data.user_id,
        label: data.label,
        tree_json: tree,
        browser_hint: data.browser_hint,
        created_at: data.created_at,
        encrypted: true,
      }
    }

    const { data, error } = await supabase
      .from('bookmark_backups')
      .insert({
        user_id: user.id,
        label: label ?? new Date().toLocaleString('sv'),
        tree_json: tree,
        encrypted: false,
        browser_hint: browserHint,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    await setPersistedBookmarkTreeHash(await hashBookmarkTree(tree))
    return {
      ...(data as BookmarkBackup),
      tree_json: tree,
      encrypted: false,
    }
  },

  /**
   * Xóa PIN: giải mã toàn bộ backup encrypted → lưu lại dạng plaintext.
   * Gọi trước khi xóa bookmark_crypto row.
   */
  async decryptAllEncryptedToPlaintext(oldKey: CryptoKey): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { data: rows, error } = await supabase
      .from('bookmark_backups')
      .select('id, payload_iv, payload_ciphertext')
      .eq('user_id', user.id)
      .eq('encrypted', true)
    if (error) throw new Error(error.message)
    if (!rows?.length) return
    for (const raw of rows) {
      const row = raw as { id: string; payload_iv: string | null; payload_ciphertext: string | null }
      if (!row.payload_iv || !row.payload_ciphertext) continue
      const tree = await decryptBookmarkTree(row.payload_iv, row.payload_ciphertext, oldKey)
      const { error: upErr } = await supabase
        .from('bookmark_backups')
        .update({ tree_json: tree, encrypted: false, payload_iv: null, payload_ciphertext: null })
        .eq('id', row.id)
      if (upErr) throw new Error(upErr.message)
    }
  },

  /**
   * Đổi PIN: mã hóa lại mọi backup encrypted bằng khóa mới (legacy plaintext giữ nguyên).
   */
  async reencryptAllEncryptedBackups(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { data: rows, error } = await supabase
      .from('bookmark_backups')
      .select('id, payload_iv, payload_ciphertext')
      .eq('user_id', user.id)
      .eq('encrypted', true)
    if (error) throw new Error(error.message)
    if (!rows?.length) return
    for (const raw of rows) {
      const row = raw as { id: string; payload_iv: string | null; payload_ciphertext: string | null }
      if (!row.payload_iv || !row.payload_ciphertext) continue
      const tree = await decryptBookmarkTree(row.payload_iv, row.payload_ciphertext, oldKey)
      const { ivB64, ctB64 } = await encryptBookmarkTree(tree, newKey)
      const { error: upErr } = await supabase
        .from('bookmark_backups')
        .update({ payload_iv: ivB64, payload_ciphertext: ctB64 })
        .eq('id', row.id)
      if (upErr) throw new Error(upErr.message)
    }
  },

  /** Xóa 1 backup (cloud hoặc local tùy mode) */
  async deleteBackup(id: string): Promise<void> {
    if (!(await isAuthenticated())) {
      await localBookmarksService.deleteBackup(id)
      return
    }
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
   *  Chiến lược: xóa hết children của các folder top-level hiện tại (bar / Other / …), rồi import lại.
   *  Quan trọng: không dùng `id` từ bản snapshot (backup) làm parentId — ID chỉ có hiệu lực
   *  trong profile đã chụp; profile/trình duyệt khác có ID khác → Chrome lỗi "Can't find parent bookmark for id".
   *  Ghép từng folder top của backup với folder top của cây live theo đúng thứ tự `getTree()` (ổn định trong Chromium).
   */
  async restoreToChrome(tree: BookmarkNode[]): Promise<void> {
    await removeChildrenOfRootTopFolders()
    const liveRoots = (
      (await chrome.bookmarks.getTree()) as unknown as BookmarkNode[]
    )[0]
    const backupRoot = tree[0]
    if (!liveRoots?.children?.length || !backupRoot?.children?.length) return

    const liveTop = liveRoots.children
    const backupTop = backupRoot.children
    const pairs = Math.min(liveTop.length, backupTop.length)
    for (let i = 0; i < pairs; i++) {
      const liveFolderId = liveTop[i].id
      const backupFolder = backupTop[i]
      if (!backupFolder) continue
      if (backupFolder.children?.length) {
        await importChildren(liveFolderId, backupFolder.children)
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
      'Live browser',
    )
    for (const bk of backups) {
      pushFromRows(
        flattenBookmarkUrls(bk.tree_json),
        bk.id,
        `Backup · ${bk.label}`,
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
