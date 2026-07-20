<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useAccountCryptoStore } from '@/stores/accountCrypto'
import { useLangStore } from '@/stores/uiLang'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{
  close: []
  done: []
}>()

const account = useAccountCryptoStore()
const { t } = useLangStore()
const busy = ref(false)
const error = ref('')
const mode = ref<'passphrase' | 'recovery'>('passphrase')
const password = ref('')
const recoveryInput = ref('')
const newPassphrase = ref('')
const confirmNew = ref('')
const panelRef = ref<HTMLElement | null>(null)
const firstInputRef = ref<InstanceType<typeof RetroInput> | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      error.value = ''
      mode.value = 'passphrase'
      password.value = ''
      recoveryInput.value = ''
      newPassphrase.value = ''
      confirmNew.value = ''
      await nextTick()
      panelRef.value?.focus()
      firstInputRef.value?.focus()
    }
  },
)

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'recovery') {
      if (newPassphrase.value !== confirmNew.value) {
        throw new Error(t('account.errNewMismatch'))
      }
      await account.unlockWithRecoveryAndRewrap(recoveryInput.value, newPassphrase.value)
    } else {
      await account.unlock(password.value)
    }
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

function onClose(): void {
  account.unlockModalOpen = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="account-modal__backdrop bbqone-overlay"
      role="presentation"
      @click.self="onClose"
    >
      <div
        ref="panelRef"
        class="account-modal"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @keydown="onPanelKeydown"
      >
        <p class="account-modal__title">
          {{ t('account.titleUnlock') }}
        </p>
        <p v-if="error" class="account-modal__err" role="alert">
          {{ error }}
        </p>

        <template v-if="mode === 'passphrase'">
          <label class="account-modal__label" for="acct-unlock-pw">
            {{ t('account.passphraseLabel') }}
          </label>
          <RetroInput
            id="acct-unlock-pw"
            ref="firstInputRef"
            v-model="password"
            type="password"
            :placeholder="t('secureFolder.placeholder')"
            autocomplete="off"
            :disabled="busy"
            @keydown.enter.prevent="submit"
          />
          <button
            type="button"
            class="account-modal__link"
            :disabled="busy"
            @click="mode = 'recovery'"
          >
            {{ t('account.forgot') }}
          </button>
        </template>

        <template v-else>
          <p class="account-modal__hint">
            {{ t('account.recoveryRewrapHint') }}
          </p>
          <label class="account-modal__label" for="acct-recovery-key">
            {{ t('account.recoveryTitle') }}
          </label>
          <RetroInput
            id="acct-recovery-key"
            ref="firstInputRef"
            v-model="recoveryInput"
            type="text"
            autocomplete="off"
            :disabled="busy"
          />
          <label class="account-modal__label" for="acct-recovery-new">
            {{ t('account.passphraseLabel') }}
          </label>
          <RetroInput
            id="acct-recovery-new"
            v-model="newPassphrase"
            type="password"
            :placeholder="t('account.passphraseHint')"
            autocomplete="new-password"
            :disabled="busy"
          />
          <label class="account-modal__label" for="acct-recovery-confirm">
            {{ t('secureFolder.confirm') }}
          </label>
          <RetroInput
            id="acct-recovery-confirm"
            v-model="confirmNew"
            type="password"
            autocomplete="new-password"
            :disabled="busy"
            @keydown.enter.prevent="submit"
          />
          <button
            type="button"
            class="account-modal__link"
            :disabled="busy"
            @click="mode = 'passphrase'"
          >
            {{ t('account.backToPassphrase') }}
          </button>
        </template>

        <div class="account-modal__actions">
          <RetroButton variant="sm" type="button" :disabled="busy" @click="submit">
            {{ t('account.unlock') }}
          </RetroButton>
          <RetroButton variant="sm" type="button" :disabled="busy" @click="onClose">
            {{ t('account.later') }}
          </RetroButton>
        </div>
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

.account-modal__title {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.012em;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
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

.account-modal__label {
  display: block;
  margin: 8px 0 4px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-weight: 600;
  letter-spacing: -0.012em;
}

.account-modal__link {
  display: inline-block;
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-size: var(--font-size-sm);
  cursor: pointer;
  text-align: left;
}

.account-modal__link:hover:not(:disabled) {
  text-decoration: underline;
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
