import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { withTimeout } from '@/utils/withTimeout'

const AUTH_INIT_MS = 8_000

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

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()
  if (!auth.initialized) {
    try {
      await withTimeout(auth.init(), AUTH_INIT_MS, 'Auth init timed out')
    } catch {
      /* Popup vẫn mở — auth.init() tiếp tục nền; finally luôn set initialized */
    }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    next({ name: 'dashboard' })
    return
  }
  next()
})

export default router
