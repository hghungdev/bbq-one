import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { BBQ_PENDING_ROUTE_KEY } from '@/constants/storage'
import { useSettingsStore } from '@/stores/settings'
import './assets/styles/global.css'
import './assets/styles/retro.css'

async function bootstrap(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)
  await useSettingsStore().load()
  const pending = await chrome.storage.local.get(BBQ_PENDING_ROUTE_KEY)
  const routePath = pending[BBQ_PENDING_ROUTE_KEY]
  if (typeof routePath === 'string' && routePath.length > 0) {
    await chrome.storage.local.remove(BBQ_PENDING_ROUTE_KEY)
    const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`
    window.location.hash = `#${normalized}`
  }
  app.use(router)
  await router.isReady()
  app.mount('#app')
}

void bootstrap()
