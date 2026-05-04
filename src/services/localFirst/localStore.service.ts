import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'

/**
 * Generic wrapper around chrome.storage.local with type safety.
 * All local data is stored as JSON arrays under a stable key.
 */
export const localStore = {
  /**
   * Get an array stored under key. Returns empty array if not present.
   */
  async getArray<T>(key: string): Promise<T[]> {
    const result = await chrome.storage.local.get(key)
    const value = result[key]
    return Array.isArray(value) ? (value as T[]) : []
  },

  /**
   * Replace entire array under key.
   */
  async setArray<T>(key: string, value: T[]): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  },

  /**
   * Append item to array under key.
   */
  async pushItem<T>(key: string, item: T): Promise<void> {
    const arr = await this.getArray<T>(key)
    arr.push(item)
    await this.setArray(key, arr)
  },

  /**
   * Remove all data for given keys (used after successful sync).
   */
  async clearKeys(keys: string[]): Promise<void> {
    await chrome.storage.local.remove(keys)
  },

  /**
   * Clear all bbqone_local_* keys.
   */
  async clearAllLocal(): Promise<void> {
    await this.clearKeys(Object.values(LOCAL_STORAGE_KEYS))
  },
}
