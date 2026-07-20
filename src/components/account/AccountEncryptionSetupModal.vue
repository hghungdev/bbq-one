<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { generateRecoveryKey } from '@/utils/accountCrypto'
import { useAccountCryptoStore } from '@/stores/accountCrypto'
import { useLangStore } from '@/stores/uiLang'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{
  close: []
  done: []
}>()

const account = useAccountCryptoStore()
const { t } = useLangStore()
const step = ref(1)
const busy = ref(false)
const error = ref('')
const ack1 = ref(false)
const ack2 = ref(false)
const ack3 = ref(false)
const passphrase = ref('')
const confirmPassphrase = ref('')
const recovery = ref<{ display: string; bytes: Uint8Array } | null>(null)
const confirmIdx = ref<[number, number]>([0, 1])
const g1 = ref('')
const g2 = ref('')
const panelRef = ref<HTMLElement | null>(null)

const canProceedStep1 = computed(() => ack1.value && ack2.value && ack3.value)
const canProceedStep2 = computed(
  () => passphrase.value.length >= 10 && passphrase.value === confirmPassphrase.value,
)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      step.value = 1
      busy.value = false
      error.value = ''
      ack1.value = false
      ack2.value = false
      ack3.value = false
      passphrase.value = ''
      confirmPassphrase.value = ''
      recovery.value = null
      g1.value = ''
      g2.value = ''
      await nextTick()
      panelRef.value?.focus()
    }
  },
)

function pickTwoDistinct(): [number, number] {
  const a = Math.floor(Math.random() * 8)
  let b = Math.floor(Math.random() * 8)
  while (b === a) b = Math.floor(Math.random() * 8)
  return a < b ? [a, b] : [b, a]
}

function goStep2(): void {
  error.value = ''
  step.value = 2
}

function goStep3(): void {
  if (passphrase.value.length < 10) {
    error.value = t('account.passphraseHint')
    return
  }
  if (passphrase.value !== confirmPassphrase.value) {
    error.value = t('account.errNewMismatch')
    return
  }
  error.value = ''
  recovery.value = generateRecoveryKey()
  confirmIdx.value = pickTwoDistinct()
  step.value = 3
}

async function copyRecovery(): Promise<void> {
  if (!recovery.value) return
  try {
    await navigator.clipboard.writeText(recovery.value.display)
  } catch {
    /* ignore */
  }
}

async function enable(): Promise<void> {
  if (busy.value || !recovery.value) return
  error.value = ''
  busy.value = true
  try {
    const groups = recovery.value.display.split('-')
    if (
      g1.value.trim().toUpperCase() !== groups[confirmIdx.value[0]] ||
      g2.value.trim().toUpperCase() !== groups[confirmIdx.value[1]]
    ) {
      throw new Error(t('account.errGroupMismatch'))
    }
    await account.enableAccountEncryption(passphrase.value, {
      recoveryBytes: recovery.value.bytes,
    })
    emit('done')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('common.operationFailed')
  } finally {
    busy.value = false
  }
}

function onPanelKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="account-modal__backdrop bbqone-overlay"
      role="presentation"
      @click.self="emit('close')"
    >
      <div
        ref="panelRef"
        class="account-modal account-modal--wide"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @keydown="onPanelKeydown"
      >
        <p class="account-modal__title">
          {{ t('account.setupTitle') }}
        </p>
        <p class="account-modal__step">
          {{ t('account.stepOf', { step, total: 3 }) }}
        </p>
        <p v-if="error" class="account-modal__err" role="alert">
          {{ error }}
        </p>

        <template v-if="step === 1">
          <p class="account-modal__hint">
            {{ t('account.setupIntro') }}
          </p>
          <label class="account-modal__check">
            <input v-model="ack1" type="checkbox" :disabled="busy">
            {{ t('account.ack1') }}
          </label>
          <label class="account-modal__check">
            <input v-model="ack2" type="checkbox" :disabled="busy">
            {{ t('account.ack2') }}
          </label>
          <label class="account-modal__check">
            <input v-model="ack3" type="checkbox" :disabled="busy">
            {{ t('account.ack3') }}
          </label>
          <div class="account-modal__actions">
            <RetroButton variant="sm" type="button" :disabled="!canProceedStep1" @click="goStep2">
              {{ t('account.continue') }}
            </RetroButton>
            <RetroButton variant="sm" type="button" @click="emit('close')">
              {{ t('common.bracketClear') }}
            </RetroButton>
          </div>
        </template>

        <template v-else-if="step === 2">
          <label class="account-modal__label" for="acct-setup-pw">
            {{ t('account.passphraseLabel') }}
          </label>
          <RetroInput
            id="acct-setup-pw"
            v-model="passphrase"
            type="password"
            :placeholder="t('account.passphraseHint')"
            autocomplete="new-password"
            :disabled="busy"
          />
          <label class="account-modal__label" for="acct-setup-confirm">
            {{ t('secureFolder.confirm') }}
          </label>
          <RetroInput
            id="acct-setup-confirm"
            v-model="confirmPassphrase"
            type="password"
            autocomplete="new-password"
            :disabled="busy"
            @keydown.enter.prevent="goStep3"
          />
          <div class="account-modal__actions">
            <RetroButton variant="sm" type="button" :disabled="!canProceedStep2" @click="goStep3">
              {{ t('account.continue') }}
            </RetroButton>
            <RetroButton variant="sm" type="button" @click="step = 1">
              {{ t('account.back') }}
            </RetroButton>
          </div>
        </template>

        <template v-else>
          <p class="account-modal__hint">
            {{ t('account.recoveryHint') }}
          </p>
          <p v-if="recovery" class="account-modal__recovery-key">
            {{ recovery.display }}
          </p>
          <RetroButton variant="sm" type="button" :disabled="busy" @click="copyRecovery">
            {{ t('account.copy') }}
          </RetroButton>
          <p class="account-modal__hint account-modal__hint--warn">
            {{ t('account.savedCheck') }}
          </p>
          <p class="account-modal__hint">
            {{ t('account.confirmGroups') }}
          </p>
          <label class="account-modal__label" for="acct-setup-g1">
            {{ t('account.groupLabel', { n: confirmIdx[0] + 1 }) }}
          </label>
          <RetroInput
            id="acct-setup-g1"
            v-model="g1"
            type="text"
            autocomplete="off"
            :disabled="busy"
          />
          <label class="account-modal__label" for="acct-setup-g2">
            {{ t('account.groupLabel', { n: confirmIdx[1] + 1 }) }}
          </label>
          <RetroInput
            id="acct-setup-g2"
            v-model="g2"
            type="text"
            autocomplete="off"
            :disabled="busy"
            @keydown.enter.prevent="enable"
          />
          <div class="account-modal__actions">
            <RetroButton variant="sm" type="button" :disabled="busy" @click="enable">
              {{ t('account.enableCta') }}
            </RetroButton>
            <RetroButton variant="sm" type="button" :disabled="busy" @click="step = 2">
              {{ t('account.back') }}
            </RetroButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.account-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-scrim);
  padding: 16px;
}

.account-modal {
  width: 100%;
  max-width: 360px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--accent) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  box-shadow: 0 18px 54px var(--panel-ring);
  padding: 12px;
  outline: none;
  overflow: hidden;
}

.account-modal--wide {
  max-width: 420px;
}

.account-modal__title {
  margin: 0 0 8px;
  padding: 8px 10px;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.012em;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
}

.account-modal__step {
  margin: 0 0 12px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.account-modal__err {
  margin: 0 0 10px;
  padding: 7px 9px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
}

.account-modal__hint {
  margin: 0 0 10px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.4;
}

.account-modal__hint--warn {
  color: var(--text-secondary);
  font-weight: 600;
}

.account-modal__check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 8px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.35;
  cursor: pointer;
}

.account-modal__label {
  display: block;
  margin: 8px 0 4px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-weight: 600;
  letter-spacing: -0.012em;
}

.account-modal__recovery-key {
  margin: 0 0 10px;
  padding: 10px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  word-break: break-all;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-primary);
}

.account-modal__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 14px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
}
</style>
