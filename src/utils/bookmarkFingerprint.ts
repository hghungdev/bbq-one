import { BOOKMARK_LAST_TREE_HASH_KEY } from '@/constants/storage'
import type { BookmarkNode } from '@/types/bookmark'

/** Fingerprint ổn định cho toàn bộ cây bookmark (để so sánh có cần backup không). */
export async function hashBookmarkTree(tree: BookmarkNode[]): Promise<string> {
  const json = JSON.stringify(tree)
  const enc = new TextEncoder().encode(json)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function getPersistedBookmarkTreeHash(): Promise<string | null> {
  const r = await chrome.storage.local.get(BOOKMARK_LAST_TREE_HASH_KEY)
  const v = r[BOOKMARK_LAST_TREE_HASH_KEY]
  return typeof v === 'string' ? v : null
}

export async function setPersistedBookmarkTreeHash(hash: string): Promise<void> {
  await chrome.storage.local.set({ [BOOKMARK_LAST_TREE_HASH_KEY]: hash })
}

/** Đăng xuất: xóa baseline để user khác / phiên sau không so sánh nhầm. */
export async function clearPersistedBookmarkTreeHash(): Promise<void> {
  await chrome.storage.local.remove(BOOKMARK_LAST_TREE_HASH_KEY)
}
