/**
 * Track MyMemory free tier daily quota.
 * Free tier: 5,000 words/day per IP (anonymous).
 *
 * Strategy:
 * - Reset counter at midnight (local timezone)
 * - Mark exhausted explicitly when API returns quotaFinished=true
 * - Anti-conservative: assume word ≈ 6 chars, cap at 4500 to leave buffer
 */

interface RateLimitState {
  date: string // YYYY-MM-DD
  charactersUsed: number
  exhausted: boolean
}

const STORAGE_KEY = 'bbqone_mymemory_quota'
const DAILY_CHAR_LIMIT = 27000 // ~4500 words × 6 chars

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

async function getState(): Promise<RateLimitState> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const state = result[STORAGE_KEY] as RateLimitState | undefined

  // Reset nếu sang ngày mới
  if (!state || state.date !== todayKey()) {
    return { date: todayKey(), charactersUsed: 0, exhausted: false }
  }
  return state
}

async function setState(state: RateLimitState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state })
}

export const mymemoryRateLimit = {
  async isQuotaExhausted(): Promise<boolean> {
    const state = await getState()
    return state.exhausted || state.charactersUsed >= DAILY_CHAR_LIMIT
  },

  async recordRequest(textLength: number): Promise<void> {
    const state = await getState()
    state.charactersUsed += textLength
    if (state.charactersUsed >= DAILY_CHAR_LIMIT) {
      state.exhausted = true
    }
    await setState(state)
  },

  async markQuotaExhausted(): Promise<void> {
    const state = await getState()
    state.exhausted = true
    await setState(state)
  },

  async getRemainingChars(): Promise<number> {
    const state = await getState()
    return Math.max(0, DAILY_CHAR_LIMIT - state.charactersUsed)
  },
}
