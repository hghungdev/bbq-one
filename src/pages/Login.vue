<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import RetroInput from '@/components/ui/RetroInput.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured, missingEnvHint } from '@/env'
import { formatAuthErrorMessage } from '@/utils/authErrors'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

async function onSubmit(): Promise<void> {
  errorMessage.value = null
  if (!isSupabaseConfigured) {
    errorMessage.value = missingEnvHint
    return
  }
  loading.value = true
  try {
    await auth.login(email.value.trim(), password.value)
    await router.replace({ name: 'home' })
  } catch (e) {
    errorMessage.value = formatAuthErrorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login login--centered crt-scanlines">
    <p
      v-if="!isSupabaseConfigured"
      class="login__config-warn"
      role="alert"
    >
      {{ missingEnvHint }}
    </p>
    <div class="login__panel">
      <header class="login__header">
        <h1 class="login__title">
          BBQOne v1.0<span class="cursor-blink" aria-hidden="true"></span>
        </h1>
        <div class="login__rule" />
      </header>

      <form class="login__form" @submit.prevent="onSubmit">
        <label class="login__label" for="bbqone-email">EMAIL:</label>
        <RetroInput
          id="bbqone-email"
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="user@example.com"
          :disabled="loading"
        />

        <label class="login__label" for="bbqone-password">PASSWORD:</label>
        <RetroInput
          id="bbqone-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="••••••••••"
          :disabled="loading"
        />

        <p
          v-if="errorMessage"
          class="login__error"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <p
          v-if="auth.initError && !errorMessage"
          class="login__warn"
          role="status"
        >
          {{ formatAuthErrorMessage(auth.initError) }}
        </p>

        <div class="login__actions">
          <RetroButton type="submit" :disabled="loading">
            {{ loading ? '...' : '[ LOGIN ]' }}
          </RetroButton>
        </div>
      </form>

      <footer class="login__footer">
        &gt; SECURE · ENCRYPTED
      </footer>
    </div>
  </div>
</template>

<style scoped>
.login {
  /* Đồng bộ cobalt với dashboard — viền / CTA / focus không bị chìm trên nền kem */
  --accent: var(--accent-dashboard);
  --focus-ring: var(--accent-dashboard);
  --border: #8ca3cc;
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
  border: 1px solid var(--border);
  background: var(--bg-panel);
}

.login__panel {
  width: 100%;
  max-width: min(440px, calc(100% - 8px));
  margin: 0 auto;
  border: 1px solid var(--border);
  padding: 20px 18px 16px;
  background: var(--bg-secondary);
  box-shadow: 0 0 0 1px rgba(140, 110, 70, 0.18);
}

.login__header {
  margin-bottom: 20px;
}

.login__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.login__rule {
  height: 1px;
  margin-top: 10px;
  background: var(--border);
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.login__label {
  margin-top: 4px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  letter-spacing: 0.08em;
}

.login__actions {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.login__error {
  margin: 4px 0 0;
  font-size: var(--font-size-sm);
  color: var(--danger);
}

.login__warn {
  margin: 4px 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.login__footer {
  margin-top: 20px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}
</style>
