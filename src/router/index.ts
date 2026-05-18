import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

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
    await auth.init()
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    next({ name: 'dashboard' })
    return
  }
  next()
})

export default router
