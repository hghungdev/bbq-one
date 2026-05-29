import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { withTimeout } from '@/utils/withTimeout'
import { isOnline } from '@/services/networkReachability.service'
import { BBQ_AUTH_LOGGED_IN_KEY } from '@/constants/storage'

/** Online: cho auth.init() chạy nhanh — getSession() đọc local cache thường < 200ms.
 *  Nếu vượt timeout (Supabase chậm/treo) thì cứ tiếp tục boot; init chạy nền. */
const AUTH_INIT_MS = 1_500

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/pages/App.vue'),
    },
  ],
})

async function readCachedLoggedIn(): Promise<boolean> {
  try {
    const r = await chrome.storage.local.get(BBQ_AUTH_LOGGED_IN_KEY)
    return !!r[BBQ_AUTH_LOGGED_IN_KEY]
  } catch {
    return false
  }
}

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()
  if (!auth.initialized) {
    if (!isOnline()) {
      // Offline boot: KHÔNG block trên Supabase getSession (có thể trigger token
      // refresh sang network và hang). Đọc cờ cache → mở popup ngay → init() nền.
      const cached = await readCachedLoggedIn()
      await auth.hydrateOfflineLoggedIn(cached)
      void auth.init()
    } else {
      try {
        await withTimeout(auth.init(), AUTH_INIT_MS, 'Auth init timed out')
      } catch {
        /* Popup vẫn mở — auth.init() tiếp tục nền; finally luôn set initialized */
      }
    }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    next({ name: 'dashboard' })
    return
  }
  next()
})

export default router
