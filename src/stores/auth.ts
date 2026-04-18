import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'
import { bootstrapBookmarkBaseline } from '@/services/bookmarkAutoBackup.service'
import { useBookmarkPinStore } from '@/stores/bookmarkPin'
import { clearPersistedBookmarkTreeHash } from '@/utils/bookmarkFingerprint'
import {
  authService,
  getLoginDeadline,
  setLoginDeadline,
} from '@/services/auth.service'

/** Kiểm tra hết hạn 10 phút (và đồng bộ state) mỗi 30 giây khi đã đăng nhập. */
const SESSION_CHECK_INTERVAL_MS = 30 * 1000

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const user = ref<User | null>(null)
  const initialized = ref(false)
  const initError = ref<string | null>(null)
  let authSubscription: { unsubscribe: () => void } | null = null
  let sessionExpiryTimer: ReturnType<typeof setInterval> | null = null

  const isAuthenticated = computed(() => !!session.value)

  async function enforceLoginDeadline(): Promise<boolean> {
    const deadline = await getLoginDeadline()
    if (!deadline || Date.now() > deadline) {
      await supabase.auth.signOut()
      await chrome.storage.session.clear()
      await clearPersistedBookmarkTreeHash()
      void useBookmarkPinStore().lock()
      session.value = null
      user.value = null
      stopSessionExpiryWatcher()
      return false
    }
    return true
  }

  function stopSessionExpiryWatcher(): void {
    if (sessionExpiryTimer !== null) {
      clearInterval(sessionExpiryTimer)
      sessionExpiryTimer = null
    }
  }

  function startSessionExpiryWatcher(): void {
    stopSessionExpiryWatcher()
    sessionExpiryTimer = setInterval(() => {
      void (async () => {
        if (!session.value) return
        const ok = await enforceLoginDeadline()
        if (!ok && typeof window !== 'undefined') {
          const path = window.location.hash.replace(/^#/, '') || '/'
          if (!path.includes('/login')) {
            window.location.hash = '#/login'
          }
        }
      })()
    }, SESSION_CHECK_INTERVAL_MS)
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

      let nextSession = current
      if (current) {
        const deadline = await getLoginDeadline()
        if (!deadline || Date.now() > deadline) {
          await supabase.auth.signOut()
          await chrome.storage.session.clear()
          await clearPersistedBookmarkTreeHash()
          void useBookmarkPinStore().lock()
          nextSession = null
        }
      }

      session.value = nextSession
      user.value = nextSession?.user ?? null

      if (nextSession) {
        startSessionExpiryWatcher()
      }

      if (!authSubscription) {
        const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
          session.value = newSession
          user.value = newSession?.user ?? null
          /* Chỉ SIGNED_IN mới reset mốc 10 phút — không reset khi TOKEN_REFRESHED. */
          if (event === 'SIGNED_IN' && newSession) {
            void setLoginDeadline()
            void bootstrapBookmarkBaseline()
          }
          if (newSession) {
            startSessionExpiryWatcher()
          } else {
            stopSessionExpiryWatcher()
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
    startSessionExpiryWatcher()
  }

  async function logout(): Promise<void> {
    stopSessionExpiryWatcher()
    await authService.logout()
    session.value = null
    user.value = null
    await clearPersistedBookmarkTreeHash()
    await useBookmarkPinStore().lock()
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
