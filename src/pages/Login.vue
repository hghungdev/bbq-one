<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import RetroInput from '@/components/ui/RetroInput.vue'
  import RetroButton from '@/components/ui/RetroButton.vue'
  import { useAuthStore } from '@/stores/auth'
  import { useLangStore } from '@/stores/uiLang'
  import { isSupabaseConfigured, missingEnvHint } from '@/env'
  import { formatAuthErrorMessage } from '@/utils/authErrors'

  const router = useRouter()
  const auth = useAuthStore()
  const langStore = useLangStore()
  const { t } = langStore

  const email = ref('')
  const password = ref('')
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  onMounted(async () => {
    await langStore.loadLang()
  })

  async function onSubmit(): Promise<void> {
    errorMessage.value = null
    if (!isSupabaseConfigured) {
      errorMessage.value = missingEnvHint
      return
    }
    loading.value = true
    try {
      await auth.login(email.value.trim(), password.value)
      await router.replace({ name: 'dashboard' })
    } catch (e) {
      errorMessage.value = formatAuthErrorMessage(e)
    } finally {
      loading.value = false
    }
  }
</script>

<template>
  <div class="login login--centered">
    <p v-if="!isSupabaseConfigured" class="login__config-warn" role="alert">
      {{ missingEnvHint }}
    </p>
    <div class="login__panel">
      <header class="login__header">
        <h1 class="login__title">BBQOne</h1>
      </header>

      <form class="login__form" @submit.prevent="onSubmit">
        <label class="login__label" for="bbqone-email">{{ t('login.email') }}</label>
        <RetroInput
          id="bbqone-email"
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="user@example.com"
          :disabled="loading"
        />

        <label class="login__label" for="bbqone-password">{{ t('login.password') }}</label>
        <RetroInput
          id="bbqone-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="••••••••••"
          :disabled="loading"
        />

        <p v-if="errorMessage" class="login__error" role="alert">
          {{ errorMessage }}
        </p>
        <p v-if="auth.initError && !errorMessage" class="login__warn" role="status">
          {{ formatAuthErrorMessage(auth.initError) }}
        </p>

        <div class="login__actions">
          <RetroButton type="submit" :disabled="loading">
            {{ loading ? t('login.loading') : t('login.btn') }}
          </RetroButton>
        </div>
      </form>

      <footer class="login__footer">
        {{ t('login.footer') }}
      </footer>
    </div>
  </div>
</template>

<style scoped>
  .login {
    --accent: var(--accent-dashboard);
    --focus-ring: var(--color-primary-focus);
    box-sizing: border-box;
    min-width: 320px;
    min-height: 0;
    flex: 1 1 auto;
    width: 100%;
    max-height: 100%;
    overflow-y: auto;
    padding: 20px 16px;
    background-color: var(--bg-primary);
    background-image: radial-gradient(
      ellipse 120% 80% at 50% 0%,
      var(--bg-login-glow) 0%,
      transparent 55%
    );
  }

  /* Căn form theo trục dọc + ngang — hết cảm giác khoảng trống phía dưới panel */
  .login--centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .login__config-warn {
    max-width: min(440px, calc(100% - 8px));
    margin: 0 auto 14px;
    padding: 10px 12px;
    font-size: var(--font-size-sm);
    line-height: 1.45;
    color: var(--danger);
    border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
    border-radius: var(--radius-md);
    background: var(--surface-danger-muted);
  }

  .login__panel {
    width: 100%;
    max-width: min(440px, calc(100% - 8px));
    margin: 0 auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px;
    background:
      radial-gradient(
        ellipse 110% 80% at 50% 0%,
        color-mix(in srgb, var(--accent) 5%, transparent) 0%,
        transparent 58%
      ),
      var(--bg-secondary);
    box-shadow: 0 18px 54px var(--panel-ring);
    overflow: hidden;
  }

  .login__header {
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
  }

  .login__title {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.035em;
  }

  .login__form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
  }

  .login__label {
    margin-top: 4px;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: 600;
    letter-spacing: -0.012em;
  }

  .login__actions {
    display: flex;
    justify-content: center;
    margin-top: 16px;
  }

  .login__error {
    margin: 4px 0 0;
    padding: 7px 9px;
    font-size: var(--font-size-sm);
    color: var(--danger);
    border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
    border-radius: var(--radius-md);
    background: var(--surface-danger-muted);
  }

  .login__warn {
    margin: 4px 0 0;
    padding: 7px 9px;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-panel) 70%, transparent);
  }

  .login__footer {
    margin-top: 20px;
    padding: 6px 8px;
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    text-align: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--bg-panel) 64%, transparent);
    letter-spacing: -0.012em;
  }
</style>
