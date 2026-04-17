import { AUTH_SESSION_DEADLINE_KEY, SESSION_LOGIN_TIMEOUT_MS } from '@/constants/auth'
import { supabase } from './supabase'

export async function setLoginDeadline(): Promise<void> {
  await chrome.storage.session.set({
    [AUTH_SESSION_DEADLINE_KEY]: Date.now() + SESSION_LOGIN_TIMEOUT_MS,
  })
}

export async function getLoginDeadline(): Promise<number | null> {
  const r = await chrome.storage.session.get(AUTH_SESSION_DEADLINE_KEY)
  const v = r[AUTH_SESSION_DEADLINE_KEY]
  return typeof v === 'number' ? v : null
}

export async function clearLoginDeadline(): Promise<void> {
  await chrome.storage.session.remove(AUTH_SESSION_DEADLINE_KEY)
}

export const authService = {
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    await setLoginDeadline()
    return data
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut()
    await clearLoginDeadline()
    await chrome.storage.session.clear()
    /* Không gọi local.clear(): hành vi cũ xóa hết cache offline trong local. Chỉ gỡ key auth legacy (sb-*) nếu còn. */
    const all = await chrome.storage.local.get(null)
    const legacy = Object.keys(all).filter(
      (k) => k.startsWith('sb-') || k.includes('supabase.auth'),
    )
    if (legacy.length > 0) {
      await chrome.storage.local.remove(legacy)
    }
  },

  async getSession() {
    const { data } = await supabase.auth.getSession()
    return data.session
  },
}
