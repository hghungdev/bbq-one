import { createApp } from 'vue'
import { createPinia, storeToRefs } from 'pinia'
import App from './App.vue'
import router from './router'
import { BBQ_PENDING_ROUTE_KEY } from '@/constants/storage'
import { useExtensionUIModeStore } from '@/stores/extensionUIMode'
import { useSettingsStore } from '@/stores/settings'
import { useThemeStore } from '@/stores/theme'
import {
  isRecoverableRefreshTokenAuthError,
  recoverSupabaseAuthFromStaleSession,
} from '@/services/supabaseAuthRecovery.service'
import './assets/styles/global.css'
import './assets/styles/retro.css'

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  if (!isRecoverableRefreshTokenAuthError(event.reason)) return
  event.preventDefault()
  void recoverSupabaseAuthFromStaleSession(event.reason)
})

async function bootstrap(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)
  await Promise.all([
    useSettingsStore().load(),
    useExtensionUIModeStore().init(),
    useThemeStore().init(),
  ])
  const pending = await chrome.storage.local.get(BBQ_PENDING_ROUTE_KEY)
  const routePath = pending[BBQ_PENDING_ROUTE_KEY]
  if (typeof routePath === 'string' && routePath.length > 0) {
    await chrome.storage.local.remove(BBQ_PENDING_ROUTE_KEY)
    const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`
    window.location.hash = `#${normalized}`
  } else {
    const { iconQuickTranslateActive } = storeToRefs(useExtensionUIModeStore())
    if (!iconQuickTranslateActive.value) {
      window.location.hash = '#/dashboard'
    }
  }
  app.use(router)
  await router.isReady()
  app.mount('#app')
}

void bootstrap()
