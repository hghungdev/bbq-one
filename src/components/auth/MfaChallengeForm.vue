<script setup lang="ts">
import { onMounted, ref } from 'vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/uiLang'

/**
 * S2: bước 2 khi đăng nhập — tài khoản đã bật xác thực 2 bước (phiên aal1 chưa được tính là đăng nhập).
 * Hủy = đăng xuất phiên aal1 (không để phiên nửa vời).
 */
const emit = defineEmits<{
  verified: []
  cancelled: []
}>()

const auth = useAuthStore()
const { t } = useLangStore()
const code = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const inputRef = ref<InstanceType<typeof RetroInput> | null>(null)

onMounted(() => {
  inputRef.value?.focus()
})

async function onSubmit(): Promise<void> {
  if (busy.value) return
  error.value = null
  const digits = code.value.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(digits)) {
    error.value = t('mfa.err.invalid')
    return
  }
  busy.value = true
  try {
    await auth.verifyMfa(digits)
    emit('verified')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('mfa.err.invalid')
    code.value = ''
    inputRef.value?.focus()
  } finally {
    busy.value = false
  }
}

async function onCancel(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await auth.cancelMfa()
  } finally {
    busy.value = false
    emit('cancelled')
  }
}
</script>

<template>
  <form class="mfa-form" @submit.prevent="onSubmit">
    <p class="mfa-form__prompt">{{ t('mfa.loginPrompt') }}</p>
    <label class="mfa-form__label" for="mfa-code">{{ t('mfa.codeLabel') }}</label>
    <RetroInput
      id="mfa-code"
      ref="inputRef"
      v-model="code"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      :maxlength="6"
      placeholder="123456"
      :disabled="busy"
    />
    <p v-if="error" class="mfa-form__error" role="alert">{{ error }}</p>
    <div class="mfa-form__actions">
      <button type="button" class="ds-text-action ds-text-action--muted" :disabled="busy" @click="onCancel">
        {{ t('mfa.cancel') }}
      </button>
      <RetroButton type="submit" primary :disabled="busy">
        {{ busy ? t('secureFolder.unlocking') : t('mfa.verify') }}
      </RetroButton>
    </div>
    <p class="mfa-form__hint">{{ t('mfa.lostPhone') }}</p>
  </form>
</template>

<style scoped>
.mfa-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mfa-form__prompt {
  margin: 0 0 4px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.4;
}

.mfa-form__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-muted);
}

.mfa-form__error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--danger);
}

.mfa-form__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
}

.mfa-form__hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}
</style>
