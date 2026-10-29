import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { BBQ_PENDING_ROUTE_KEY } from '@/constants/storage'
import { useThemeStore } from '@/stores/theme'
import {
  isRecoverableRefreshTokenAuthError,
  recoverSupabaseAuthFromStaleSession,
} from '@/services/supabaseAuthRecovery.service'
import './assets/styles/fonts.css'
import './assets/styles/global.css'
import './assets/styles/calendar-events.css'
import './assets/styles/retro.css'
import './assets/styles/ds.css'

/**
 * U29: Chrome đóng popup khi phím Esc không được trang xử lý — Sir: popup chỉ đóng khi bấm chuột ra ngoài, Esc chỉ đóng
 * lớp trong cùng (hộp thoại, menu, ô tìm). Đánh dấu đã xử lý ở mức trang (pha capture: chạy trước cả lớp nào chặn lan
 * truyền); KHÔNG chặn lan truyền → các lớp vẫn nhận Esc như cũ. Bỏ qua khi đang gõ IME (Esc hủy phần đang soạn).
 */
window.addEventListener(
  'keydown',
  (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !e.isComposing) e.preventDefault()
  },
  { capture: true },
)

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  if (!isRecoverableRefreshTokenAuthError(event.reason)) return
  event.preventDefault()
  void recoverSupabaseAuthFromStaleSession(event.reason)
})

async function bootstrap(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)
  await useThemeStore().init()
  const pending = await chrome.storage.local.get(BBQ_PENDING_ROUTE_KEY)
  const routePath = pending[BBQ_PENDING_ROUTE_KEY]
  if (typeof routePath === 'string' && routePath.length > 0) {
    await chrome.storage.local.remove(BBQ_PENDING_ROUTE_KEY)
    const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`
    window.location.hash = `#${normalized}`
  } else if (!window.location.hash.startsWith('#/')) {
    // F1: tab mở từ thanh địa chỉ đã mang sẵn route (vd #/dashboard?note=…) — giữ nguyên.
    window.location.hash = '#/dashboard'
  }
  app.use(router)
  await router.isReady()
  app.mount('#app')
}

void bootstrap()
