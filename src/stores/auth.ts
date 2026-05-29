import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'
import { bootstrapBookmarkBaseline } from '@/services/bookmarkAutoBackup.service'
import { useBookmarkPinStore } from '@/stores/bookmarkPin'
import { clearPersistedBookmarkTreeHash } from '@/utils/bookmarkFingerprint'
import { authService } from '@/services/auth.service'
import { recoverSupabaseAuthFromStaleSession } from '@/services/supabaseAuthRecovery.service'
import { BBQ_AUTH_LOGGED_IN_KEY } from '@/constants/storage'
import { clearUpcomingBannerDismiss } from '@/services/calendarBannerDismiss.service'
import { clearOverdueReminderDismiss } from '@/services/calendarOverdueReminder.service'

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

  /** Set isAuthenticated từ cờ cache offline khi Supabase getSession có thể hang.
   *  Cho phép popup mở instant offline; sau đó init() chạy nền sẽ verify lại session. */
  async function hydrateOfflineLoggedIn(loggedInFromCache: boolean): Promise<void> {
    if (initialized.value) return
    if (loggedInFromCache) {
      // Đặt session "soft" để isAuthenticated=true; user/email chưa cần
      // (UI ch\u1ec9 ki\u1ec3m tra isAuthenticated; init() s\u1ebd ghi \u0111\u00e8 b\u1eb1ng session th\u1eadt khi online).
      session.value = { __offlineHydrated: true } as unknown as Session
    }
    initialized.value = true
  }

  async function init(): Promise<void> {
    if (initialized.value && session.value && !(session.value as unknown as { __offlineHydrated?: boolean }).__offlineHydrated) {
      return
    }
    initError.value = null
    try {
      let {
        data: { session: current },
        error,
      } = await supabase.auth.getSession()
      if (error) {
        await recoverSupabaseAuthFromStaleSession(error)
        const retry = await supabase.auth.getSession()
        current = retry.data.session
        error = retry.error
      }
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
            void clearUpcomingBannerDismiss()
            void clearOverdueReminderDismiss()
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
    void clearUpcomingBannerDismiss()
    void clearOverdueReminderDismiss()
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
    hydrateOfflineLoggedIn,
    login,
    logout,
    changeAccountPassword,
  }
})
