import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'
import { authService } from '@/services/auth.service'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const user = ref<User | null>(null)
  const initialized = ref(false)
  const initError = ref<string | null>(null)
  let authSubscription: { unsubscribe: () => void } | null = null

  const isAuthenticated = computed(() => !!session.value)

  async function init(): Promise<void> {
    if (initialized.value) return
    initError.value = null
    try {
      const {
        data: { session: current },
        error,
      } = await supabase.auth.getSession()
      if (error) throw error
      session.value = current
      user.value = current?.user ?? null
      if (!authSubscription) {
        const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
          session.value = newSession
          user.value = newSession?.user ?? null
        })
        authSubscription = data.subscription
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Auth init failed'
      initError.value = message
    } finally {
      initialized.value = true
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const data = await authService.login(email, password)
    if (!data.session) {
      throw new Error('No session returned from Supabase')
    }
    session.value = data.session
    user.value = data.session.user
  }

  async function logout(): Promise<void> {
    await authService.logout()
    session.value = null
    user.value = null
  }

  return {
    session,
    user,
    initialized,
    initError,
    isAuthenticated,
    init,
    login,
    logout,
  }
})
