<script setup lang="ts">
import { ref } from 'vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/uiLang'
import { isSupabaseConfigured, missingEnvHint } from '@/env'
import { formatAuthErrorMessage } from '@/utils/authErrors'

const emit = defineEmits<{
  close: []
  success: []
}>()

const auth = useAuthStore()
const { t } = useLangStore()

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
    emit('success')
  } catch (e) {
    errorMessage.value = formatAuthErrorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Transition name="login-modal">
    <div class="lm-overlay" @click.self="emit('close')">
      <div class="lm-panel" role="dialog" aria-modal="true" aria-labelledby="lm-title">
        <header class="lm-header">
          <h2 id="lm-title" class="lm-title">
            BBQOne v1.1<span class="cursor-blink" aria-hidden="true"></span>
          </h2>
          <button class="lm-close" type="button" :title="t('common.close')" @click="emit('close')">
            ✕
          </button>
        </header>
        <div class="lm-rule" />

        <p v-if="!isSupabaseConfigured" class="lm-config-warn" role="alert">
          {{ missingEnvHint }}
        </p>

        <form class="lm-form" @submit.prevent="onSubmit">
          <label class="lm-label" for="lm-email">{{ t('login.email') }}</label>
          <RetroInput
            id="lm-email"
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="user@example.com"
            :disabled="loading"
          />

          <label class="lm-label" for="lm-password">{{ t('login.password') }}</label>
          <RetroInput
            id="lm-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••••"
            :disabled="loading"
          />

          <p v-if="errorMessage" class="lm-error" role="alert">
            {{ errorMessage }}
          </p>
          <p v-if="auth.initError && !errorMessage" class="lm-warn" role="status">
            {{ formatAuthErrorMessage(auth.initError) }}
          </p>

          <div class="lm-actions">
            <RetroButton type="submit" :disabled="loading">
              {{ loading ? t('login.loading') : t('login.btn') }}
            </RetroButton>
          </div>
        </form>

        <footer class="lm-footer">{{ t('login.footer') }}</footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── Overlay ── */
.lm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: var(--overlay-scrim);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  --accent: var(--accent-dashboard);
  --focus-ring: var(--color-primary-focus);
}

/* ── Panel — kế thừa .login__panel ── */
.lm-panel {
  width: 100%;
  max-width: min(420px, calc(100% - 8px));
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  box-shadow:
    0 0 0 1px var(--panel-ring),
    0 8px 32px rgba(0, 0, 0, 0.16);
  padding: 18px 18px 14px;
  position: relative;
}

/* ── Header ── */
.lm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.lm-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.lm-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 14px;
  padding: 0;
  line-height: 1;
  margin-top: 2px;
  transition: color 0.15s;
}

.lm-close:hover {
  color: var(--accent);
}

.lm-rule {
  height: 1px;
  background: var(--border);
  margin-bottom: 16px;
}

/* ── Form ── */
.lm-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lm-label {
  margin-top: 4px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  letter-spacing: 0.08em;
}

.lm-actions {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}

.lm-error {
  margin: 2px 0 0;
  font-size: var(--font-size-sm);
  color: var(--danger);
}

.lm-warn {
  margin: 2px 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.lm-footer {
  margin-top: 16px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.lm-config-warn {
  margin: 0 0 10px;
  padding: 8px 10px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid var(--border);
  background: var(--bg-panel);
}

/* ── Transition ── */
.login-modal-enter-active,
.login-modal-leave-active {
  transition: opacity 0.18s ease;
}

.login-modal-enter-active .lm-panel,
.login-modal-leave-active .lm-panel {
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.login-modal-enter-from,
.login-modal-leave-to {
  opacity: 0;
}

.login-modal-enter-from .lm-panel,
.login-modal-leave-to .lm-panel {
  transform: translateY(-10px);
  opacity: 0;
}
</style>
