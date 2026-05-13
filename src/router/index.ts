import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      // `#/` chỉ áp khi Bootstrap không ép Dashboard (quick translate Active)
      path: '/',
      redirect: '/translate',
    },
    {
      path: '/translate',
      name: 'translate',
      component: () => import('@/pages/QuickTranslate.vue'),
      meta: { public: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/Login.vue'),
      meta: { public: true },
    },
    {
      // Không còn requiresAuth — anonymous users có thể dùng dashboard
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
  // Nếu đang ở login page và đã đăng nhập → redirect về dashboard
  if (to.name === 'login' && auth.isAuthenticated) {
    next({ name: 'dashboard' })
    return
  }
  next()
})

router.afterEach((to) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('html--translate-shell', to.name === 'translate')
})

export default router
