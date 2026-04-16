import { supabase } from './supabase'

export const authService = {
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut()
    await chrome.storage.local.clear()
  },

  async getSession() {
    const { data } = await supabase.auth.getSession()
    return data.session
  },
}
