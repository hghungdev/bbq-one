import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'
import { bootstrapBookmarkBaseline } from '@/services/bookmarkAutoBackup.service'
import { useBookmarkPinStore } from '@/stores/bookmarkPin'
import { clearPersistedBookmarkTreeHash } from '@/utils/bookmarkFingerprint'
import { authService } from '@/services/auth.service'
import { BBQ_AUTH_LOGGED_IN_KEY } from '@/constants/storage'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const user = ref<User | null>(null)
  const initialized = ref(false)
  const initError = ref<string | null>(null)
  let authSubscription: { unsubscribe: () => void } | null = null

  const isAuthenticated = computed(() => !!session.value)

  async function persistLoggedInForContextMenu(loggedIn: boolean): Promise<void> {
    try {
      await chrome.storage.local.set({ [BBQ_AUTH_LOGGED_IN_KEY]: loggedIn })
    } catch {
      /* extension storage optional */
    }
  }

  async function init(): Promise<void> {
    if (initialized.value) return
    initError.value = null
    try {
      const {
        data: { session: current },
        error,
      } = await supabase.auth.getSession()
      if (error) throw error

      // Supabase tự quản lý token refresh — không force logout theo custom deadline nữa.
      // Session persist cho đến khi user tự logout hoặc xóa extension.
      session.value = current
      user.value = current?.user ?? null
      void persistLoggedInForContextMenu(!!current)

      if (!authSubscription) {
        const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
          session.value = newSession
          user.value = newSession?.user ?? null
          void persistLoggedInForContextMenu(!!newSession)
          if (event === 'SIGNED_IN' && newSession) {
            void bootstrapBookmarkBaseline()
          }
          if (!newSession) {
            void clearPersistedBookmarkTreeHash()
            void useBookmarkPinStore().lock()
          }
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
    void persistLoggedInForContextMenu(true)
  }

  async function logout(): Promise<void> {
    await authService.logout()
    session.value = null
    user.value = null
    void persistLoggedInForContextMenu(false)
    await clearPersistedBookmarkTreeHash()
    await useBookmarkPinStore().lock()
  }

  async function changeAccountPassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const email = user.value?.email?.trim()
    if (!email) {
      throw new Error('Chưa đăng nhập hoặc thiếu email tài khoản.')
    }
    await authService.changePassword({
      email,
      currentPassword,
      newPassword,
    })
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
    changeAccountPassword,
  }
})
