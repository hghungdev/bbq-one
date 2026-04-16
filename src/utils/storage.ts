/** chrome.storage adapter for Supabase Auth session persistence */
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
