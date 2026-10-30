import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'
import { bootstrapBookmarkBaseline } from '@/services/bookmarkAutoBackup.service'
import { clearPersistedBookmarkTreeHash } from '@/utils/bookmarkFingerprint'
import { authService } from '@/services/auth.service'
import { recoverSupabaseAuthFromStaleSession } from '@/services/supabaseAuthRecovery.service'
import { BBQ_AUTH_LOGGED_IN_KEY } from '@/constants/storage'
import { clearUpcomingBannerDismiss } from '@/services/calendarBannerDismiss.service'
import { mfaService, type TotpEnrollment } from '@/services/mfa.service'
import { useLangStore } from '@/stores/uiLang'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const user = ref<User | null>(null)
  const initialized = ref(false)
  const initError = ref<string | null>(null)
  /** S2: có phiên nhưng tài khoản bật 2FA mà chưa nhập mã (aal1) — CHƯA tính là đăng nhập. */
  const mfaPending = ref(false)
  /** S2: số factor TOTP đã xác minh (đọc từ máy chủ) — > 0 = đã bật xác thực 2 bước. */
  const verifiedTotpCount = ref(0)
  let authSubscription: { unsubscribe: () => void } | null = null

  const isAuthenticated = computed(() => !!session.value && !mfaPending.value)
  const mfaEnabled = computed(() => verifiedTotpCount.value > 0)

  async function persistLoggedInForContextMenu(loggedIn: boolean): Promise<void> {
    try {
      await chrome.storage.local.set({ [BBQ_AUTH_LOGGED_IN_KEY]: loggedIn })
    } catch {
      /* extension storage optional */
    }
  }

  /** Gán phiên + tính lại trạng thái chờ mã 2 bước; cờ "đã đăng nhập" chỉ bật khi đã qua bước 2. */
  async function applySession(next: Session | null): Promise<void> {
    session.value = next
    user.value = next?.user ?? null
    const pending = next ? await mfaService.isPending() : false
    mfaPending.value = pending
    if (!next) verifiedTotpCount.value = 0
    void persistLoggedInForContextMenu(!!next && !pending)
  }

  /**
   * S2: đọc factor từ máy chủ — bắt cả trường hợp 2FA vừa bật ở máy khác (phiên đã lưu ở đây chưa có factor nên
   * isPending() đọc phiên vẫn ra false). Lỗi mạng: giữ trạng thái đang có.
   */
  async function refreshMfa(): Promise<void> {
    if (!session.value) {
      mfaPending.value = false
      verifiedTotpCount.value = 0
      return
    }
    try {
      verifiedTotpCount.value = (await mfaService.listVerifiedTotp()).length
    } catch {
      /* offline — giữ nguyên */
    }
    const pending =
      (await mfaService.isPending()) || (verifiedTotpCount.value > 0 && (await mfaService.currentLevel()) !== 'aal2')
    mfaPending.value = pending
    void persistLoggedInForContextMenu(!!session.value && !pending)
  }

  /** Set isAuthenticated từ cờ cache offline khi Supabase getSession có thể hang.
   *  Cho phép popup mở instant offline; sau đó init() chạy nền sẽ verify lại session. */
  async function hydrateOfflineLoggedIn(loggedInFromCache: boolean): Promise<void> {
    if (initialized.value) return
    if (loggedInFromCache) {
      // Đặt session "soft" để isAuthenticated=true; user/email chưa cần
      // (UI chỉ kiểm tra isAuthenticated; init() sẽ ghi đè bằng session thật khi online).
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
      await applySession(current)
      if (current) await refreshMfa()

      if (!authSubscription) {
        const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
          void applySession(newSession)
          if (event === 'SIGNED_IN' && newSession) {
            void bootstrapBookmarkBaseline()
            void clearUpcomingBannerDismiss()
          }
          if (!newSession) {
            void clearPersistedBookmarkTreeHash()
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

  /** S2: `mfaRequired` = tài khoản bật 2FA → hiện bước nhập mã (chưa tính là đăng nhập). */
  async function login(email: string, password: string): Promise<{ mfaRequired: boolean }> {
    const data = await authService.login(email, password)
    if (!data.session) {
      throw new Error('No session returned from Supabase')
    }
    await applySession(data.session)
    if (!mfaPending.value) void clearUpcomingBannerDismiss()
    return { mfaRequired: mfaPending.value }
  }

  /** S2: bước 2 khi đăng nhập — mã 6 số từ app xác thực. */
  async function verifyMfa(code: string): Promise<void> {
    const { t } = useLangStore()
    try {
      await mfaService.verify(code)
    } catch {
      throw new Error(t('mfa.err.invalid'))
    }
    const { data } = await supabase.auth.getSession()
    await applySession(data.session)
    await refreshMfa()
    if (!mfaPending.value) void clearUpcomingBannerDismiss()
  }

  /** S2: bỏ bước 2 → đăng xuất phiên aal1 (không để phiên nửa vời). */
  async function cancelMfa(): Promise<void> {
    await logout()
  }

  async function logout(): Promise<void> {
    await authService.logout()
    session.value = null
    user.value = null
    mfaPending.value = false
    verifiedTotpCount.value = 0
    void persistLoggedInForContextMenu(false)
    await clearPersistedBookmarkTreeHash()
  }

  async function changeAccountPassword(
    currentPassword: string,
    newPassword: string,
    mfaCode?: string,
  ): Promise<void> {
    const email = user.value?.email?.trim()
    if (!email) {
      throw new Error('Chưa đăng nhập hoặc thiếu email tài khoản.')
    }
    // S2: kiểm mật khẩu cũ = đăng nhập lại → phiên aal1 → phải có mã NGAY; thiếu thì báo trước, không đăng nhập lại.
    if (mfaEnabled.value && !mfaCode?.trim()) {
      throw new Error(useLangStore().t('mfa.err.codeRequired'))
    }
    await authService.changePassword({
      email,
      currentPassword,
      newPassword,
      mfaCode,
    })
    const { data } = await supabase.auth.getSession()
    await applySession(data.session)
  }

  /** S2 Cài đặt: bắt đầu bật 2FA — QR + chuỗi bí mật; chưa có hiệu lực tới khi confirmTotpEnroll. */
  async function startTotpEnroll(): Promise<TotpEnrollment> {
    return mfaService.enrollTotp()
  }

  async function confirmTotpEnroll(factorId: string, code: string): Promise<void> {
    const { t } = useLangStore()
    try {
      await mfaService.verify(code, factorId)
    } catch {
      throw new Error(t('mfa.err.invalid'))
    }
    const { data } = await supabase.auth.getSession()
    await applySession(data.session)
    await refreshMfa()
  }

  /** Đóng hộp bật 2FA giữa chừng → gỡ factor chưa xác minh (lỗi bỏ qua: lần bật sau enrollTotp cũng dọn). */
  async function cancelTotpEnroll(factorId: string): Promise<void> {
    try {
      await mfaService.unenroll(factorId)
    } catch {
      /* best effort */
    }
  }

  /** S2: tắt 2FA — hỏi mã trước (người ngồi máy đang mở không tắt được nếu không có điện thoại), rồi gỡ mọi factor TOTP. */
  async function disableMfa(code: string): Promise<void> {
    const { t } = useLangStore()
    const factors = await mfaService.listVerifiedTotp()
    if (factors.length === 0) {
      await refreshMfa()
      return
    }
    try {
      await mfaService.verify(code, factors[0].id)
    } catch {
      throw new Error(t('mfa.err.invalid'))
    }
    for (const f of factors) await mfaService.unenroll(f.id)
    await refreshMfa()
  }

  return {
    session,
    user,
    initialized,
    initError,
    isAuthenticated,
    mfaPending,
    mfaEnabled,
    init,
    hydrateOfflineLoggedIn,
    login,
    verifyMfa,
    cancelMfa,
    refreshMfa,
    logout,
    changeAccountPassword,
    startTotpEnroll,
    confirmTotpEnroll,
    cancelTotpEnroll,
    disableMfa,
  }
})
