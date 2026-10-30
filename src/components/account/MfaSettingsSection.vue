<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import SettingsAccordionSection from '@/components/layout/SettingsAccordionSection.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import type { TotpEnrollment } from '@/services/mfa.service'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/uiLang'
import { copyTextToClipboard } from '@/utils/clipboard'

/**
 * S2: Cài đặt › Xác thực 2 bước (TOTP, tùy chọn). Bật: QR + chuỗi bí mật → mã 6 số. Tắt: hỏi mã trước.
 * Phiên đang aal2 sau khi bật (challengeAndVerify nâng cấp phiên) — không phải đăng nhập lại.
 */
const auth = useAuthStore()
const { t } = useLangStore()

const enroll = ref<TotpEnrollment | null>(null)
const disabling = ref(false)
const code = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const message = ref<string | null>(null)
const copied = ref(false)

onMounted(() => {
  void auth.refreshMfa()
})

onBeforeUnmount(() => {
  // Đóng Cài đặt giữa lúc bật → gỡ factor chưa xác minh.
  if (enroll.value) void auth.cancelTotpEnroll(enroll.value.factorId)
})

function codeOk(): boolean {
  if (/^\d{6}$/.test(code.value.trim())) return true
  error.value = t('mfa.err.invalid')
  return false
}

async function run(fn: () => Promise<void>): Promise<void> {
  if (busy.value) return
  error.value = null
  message.value = null
  busy.value = true
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('common.operationFailed')
  } finally {
    busy.value = false
  }
}

function onStart(): Promise<void> {
  return run(async () => {
    code.value = ''
    enroll.value = await auth.startTotpEnroll()
  })
}

function onConfirm(): Promise<void> {
  if (!enroll.value || !codeOk()) return Promise.resolve()
  const factorId = enroll.value.factorId
  return run(async () => {
    await auth.confirmTotpEnroll(factorId, code.value.trim())
    enroll.value = null
    code.value = ''
    message.value = t('mfa.enabledOk')
  })
}

async function onCancelEnroll(): Promise<void> {
  const id = enroll.value?.factorId
  enroll.value = null
  code.value = ''
  error.value = null
  if (id) await auth.cancelTotpEnroll(id)
}

function onStartDisable(): void {
  disabling.value = true
  code.value = ''
  error.value = null
  message.value = null
}

function onConfirmDisable(): Promise<void> {
  if (!codeOk()) return Promise.resolve()
  return run(async () => {
    await auth.disableMfa(code.value.trim())
    disabling.value = false
    code.value = ''
    message.value = t('mfa.disabledOk')
  })
}

async function onCopySecret(): Promise<void> {
  if (!enroll.value) return
  copied.value = await copyTextToClipboard(enroll.value.secret)
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <SettingsAccordionSection :title="t('mfa.title')" :default-open="false">
    <p class="mfa-set__hint">{{ t('mfa.desc') }}</p>
    <p class="mfa-set__status" :class="{ 'mfa-set__status--on': auth.mfaEnabled }">
      {{ auth.mfaEnabled ? t('mfa.statusOn') : t('mfa.statusOff') }}
    </p>

    <!-- Bật: QR + chuỗi bí mật + mã -->
    <template v-if="enroll">
      <p class="mfa-set__hint">{{ t('mfa.scanHint') }}</p>
      <img class="mfa-set__qr" :src="enroll.qrCode" width="176" height="176" :alt="t('mfa.scanHint')" />
      <p class="mfa-set__label">{{ t('mfa.secretLabel') }}</p>
      <div class="mfa-set__secret-row">
        <code class="mfa-set__secret">{{ enroll.secret }}</code>
        <button type="button" class="ds-text-action" @click="onCopySecret">
          {{ copied ? t('settings.gcal.copied') : t('settings.gcal.copy') }}
        </button>
      </div>
      <label class="mfa-set__label" for="mfa-enroll-code">{{ t('mfa.codeLabel') }}</label>
      <RetroInput
        id="mfa-enroll-code"
        v-model="code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        :maxlength="6"
        placeholder="123456"
        :disabled="busy"
      />
      <div class="mfa-set__actions">
        <button type="button" class="ds-text-action ds-text-action--muted" :disabled="busy" @click="onCancelEnroll">
          {{ t('mfa.cancel') }}
        </button>
        <RetroButton variant="sm" type="button" primary :disabled="busy" @click="onConfirm">
          {{ busy ? t('secureFolder.unlocking') : t('mfa.verify') }}
        </RetroButton>
      </div>
    </template>

    <!-- Tắt: hỏi mã trước -->
    <template v-else-if="disabling">
      <label class="mfa-set__label" for="mfa-disable-code">{{ t('mfa.codeLabel') }}</label>
      <RetroInput
        id="mfa-disable-code"
        v-model="code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        :maxlength="6"
        placeholder="123456"
        :disabled="busy"
      />
      <div class="mfa-set__actions">
        <button type="button" class="ds-text-action ds-text-action--muted" :disabled="busy" @click="disabling = false">
          {{ t('mfa.cancel') }}
        </button>
        <RetroButton variant="sm" type="button" :disabled="busy" @click="onConfirmDisable">
          {{ busy ? t('secureFolder.unlocking') : t('mfa.disable') }}
        </RetroButton>
      </div>
    </template>

    <div v-else class="mfa-set__actions mfa-set__actions--start">
      <RetroButton v-if="!auth.mfaEnabled" variant="sm" type="button" primary :disabled="busy" @click="onStart">
        {{ t('mfa.enable') }}
      </RetroButton>
      <RetroButton v-else variant="sm" type="button" :disabled="busy" @click="onStartDisable">
        {{ t('mfa.disable') }}
      </RetroButton>
    </div>

    <p v-if="error" class="mfa-set__error" role="alert">{{ error }}</p>
    <p v-else-if="message" class="mfa-set__ok" role="status">{{ message }}</p>
    <p class="mfa-set__hint mfa-set__hint--sub">{{ t('mfa.lostPhone') }}</p>
  </SettingsAccordionSection>
</template>

<style scoped>
.mfa-set__hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}

.mfa-set__hint--sub {
  margin: 8px 0 0;
  font-size: 10px;
}

.mfa-set__status {
  margin: 0 0 8px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.mfa-set__status--on {
  color: var(--accent);
}

.mfa-set__qr {
  display: block;
  margin: 4px auto 8px;
  padding: 8px;
  border-radius: var(--radius-md);
  background: #fff;
}

.mfa-set__label {
  display: block;
  margin: 6px 0 4px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-muted);
}

.mfa-set__secret-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mfa-set__secret {
  flex: 1 1 auto;
  font-family: var(--font-mono);
  font-size: 12px;
  word-break: break-all;
  color: var(--text-primary);
}

.mfa-set__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.mfa-set__actions--start {
  justify-content: flex-start;
}

.mfa-set__error {
  margin: 8px 0 0;
  font-size: var(--font-size-sm);
  color: var(--danger);
}

.mfa-set__ok {
  margin: 8px 0 0;
  font-size: var(--font-size-sm);
  color: var(--accent);
}
</style>
