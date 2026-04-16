import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSettingsStore } from '@/stores/settings'
import './assets/styles/global.css'
import './assets/styles/retro.css'

async function bootstrap(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)
  await useSettingsStore().load()
  app.use(router)
  app.mount('#app')
}

void bootstrap()
