<script setup lang="ts">
import { ref } from 'vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import IconButton from '@/components/ui/IconButton.vue'
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
            BBQOne<span class="cursor-blink" aria-hidden="true"></span>
          </h2>
          <IconButton
            variant="default"
            :label="t('common.close')"
            @click="emit('close')"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </IconButton>
        </header>

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
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--accent) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 54px var(--panel-ring);
  padding: 12px;
  position: relative;
  overflow: hidden;
}

/* ── Header ── */
.lm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.lm-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.035em;
}

/* ── Form ── */
.lm-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
}

.lm-label {
  margin-top: 4px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: -0.012em;
}

.lm-actions {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}

.lm-error {
  margin: 2px 0 0;
  padding: 7px 9px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
}

.lm-warn {
  margin: 2px 0 0;
  padding: 7px 9px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel) 70%, transparent);
}

.lm-config-warn {
  margin: 0 0 10px;
  padding: 8px 10px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
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
