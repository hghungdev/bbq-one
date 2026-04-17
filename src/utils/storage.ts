/** chrome.storage.local — cache dữ liệu app (notes, folders, …). */
export const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(key)
    const value = result[key]
    if (value === undefined || value === null) return null
    return typeof value === 'string' ? value : null
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [key]: value })
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.local.remove(key)
  },
}

/**
 * Supabase Auth token — chrome.storage.session: xóa khi đóng trình duyệt (MV3).
 * Không dùng local để session không sống qua restart browser.
 */
export const chromeSessionStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const result = await chrome.storage.session.get(key)
    const value = result[key]
    if (value === undefined || value === null) return null
    return typeof value === 'string' ? value : null
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.session.set({ [key]: value })
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.session.remove(key)
  },
}
