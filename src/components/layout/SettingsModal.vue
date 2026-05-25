<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import LangFlagIcon from '@/components/ui/LangFlagIcon.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import SettingsAccordionSection from '@/components/layout/SettingsAccordionSection.vue'
import { useAppTimezoneStore } from '@/stores/appTimezone'
import { useAuthStore } from '@/stores/auth'
import { useBookmarkPinStore } from '@/stores/bookmarkPin'
import { useLangStore } from '@/stores/uiLang'
import { formatUtcOffsetLabel, UTC_OFFSET_OPTIONS } from '@/utils/appDateTime'
import { getExtensionVersion } from '@/utils/extensionVersion'
import { accountPasswordIssues } from '@/utils/accountPasswordValidation'
import { bookmarkPinWeakReason } from '@/utils/bookmarkPinValidation'

const emit = defineEmits<{ close: [] }>()

const auth = useAuthStore()
const bookmarkPin = useBookmarkPinStore()
const appTimezone = useAppTimezoneStore()
const { utcOffsetHours } = storeToRefs(appTimezone)
const langStore = useLangStore()
const { t } = langStore

const extensionVersion = getExtensionVersion()

const utcOffsetCurrentHint = computed(() =>
  t('settings.utcOffsetCurrent', { label: formatUtcOffsetLabel(utcOffsetHours.value) }),
)

function onUtcOffsetChange(e: Event): void {
  const v = Number((e.target as HTMLSelectElement).value)
  void appTimezone.setOffsetHours(v)
}

const bmPinOld = ref('')
const bmPinNew = ref('')
const bmPinConfirm = ref('')
const bmPinBusy = ref(false)
const bmPinError = ref<string | null>(null)
const bmPinOk = ref(false)

// Remove PIN form
const bmPinRemoveCurrent = ref('')
const bmPinRemoveBusy = ref(false)
const bmPinRemoveError = ref<string | null>(null)
const bmPinRemoveOk = ref(false)

// Setup PIN form (optional, for users without PIN)
const bmPinSetupNew = ref('')
const bmPinSetupConfirm = ref('')
const bmPinSetupBusy = ref(false)
const bmPinSetupError = ref<string | null>(null)
const bmPinSetupOk = ref(false)

const acctPwCurrent = ref('')
const acctPwNew = ref('')
const acctPwConfirm = ref('')
const acctPwBusy = ref(false)
const acctPwError = ref<string | null>(null)
const acctPwOk = ref(false)

const acctPwIssueKeys = computed(() => {
  if (acctPwNew.value.length === 0) return []
  return accountPasswordIssues(acctPwNew.value, {
    email: auth.user?.email ?? null,
  })
})

const acctPwCanSubmit = computed(() => {
  if (!auth.isAuthenticated) return false
  if (acctPwBusy.value) return false
  if (!acctPwCurrent.value || !acctPwNew.value || !acctPwConfirm.value) return false
  if (acctPwIssueKeys.value.length > 0) return false
  return true
})

function bmDigits(s: string, max: number): string {
  const d = s.replace(/\D/g, '')
  const n = Math.floor(Number(max))
  const limit = Number.isFinite(n) && n >= 1 ? n : 9
  return d.slice(0, limit)
}

async function onRemoveBookmarkPin(): Promise<void> {
  bmPinRemoveError.value = null
  bmPinRemoveOk.value = false
  const pin = bmPinRemoveCurrent.value
  if (!/^\d{6}$/.test(pin) && !/^\d{9}$/.test(pin)) {
    bmPinRemoveError.value = t('settings.pinErrOldLen')
    return
  }
  bmPinRemoveBusy.value = true
  try {
    await bookmarkPin.removePin(pin)
    bmPinRemoveCurrent.value = ''
    bmPinRemoveOk.value = true
  } catch (e) {
    bmPinRemoveError.value = (e as Error).message
  } finally {
    bmPinRemoveBusy.value = false
  }
}

async function onSetupBookmarkPin(): Promise<void> {
  bmPinSetupError.value = null
  bmPinSetupOk.value = false
  const newP = bmPinSetupNew.value
  const c = bmPinSetupConfirm.value
  if (!/^\d{6}$/.test(newP) && !/^\d{9}$/.test(newP)) {
    bmPinSetupError.value = t('settings.pinErrNewLen')
    return
  }
  if (newP !== c) {
    bmPinSetupError.value = t('settings.pinErrMismatch')
    return
  }
  const weakKey = bookmarkPinWeakReason(newP)
  if (weakKey) {
    bmPinSetupError.value = t(weakKey)
    return
  }
  bmPinSetupBusy.value = true
  try {
    await bookmarkPin.setupPin(newP)
    bmPinSetupNew.value = ''
    bmPinSetupConfirm.value = ''
    bmPinSetupOk.value = true
  } catch (e) {
    bmPinSetupError.value = (e as Error).message
  } finally {
    bmPinSetupBusy.value = false
  }
}

async function onChangeBookmarkPin(): Promise<void> {
  bmPinError.value = null
  bmPinOk.value = false
  const oldP = bmPinOld.value
  const newP = bmPinNew.value
  const c = bmPinConfirm.value
  if (!/^\d{6}$/.test(oldP) && !/^\d{9}$/.test(oldP)) {
    bmPinError.value = t('settings.pinErrOldLen')
    return
  }
  if (!/^\d{6}$/.test(newP) && !/^\d{9}$/.test(newP)) {
    bmPinError.value = t('settings.pinErrNewLen')
    return
  }
  if (newP !== c) {
    bmPinError.value = t('settings.pinErrMismatch')
    return
  }
  const weakKey = bookmarkPinWeakReason(newP)
  if (weakKey) {
    bmPinError.value = t(weakKey)
    return
  }
  bmPinBusy.value = true
  try {
    await bookmarkPin.changePin(oldP, newP)
    bmPinOld.value = ''
    bmPinNew.value = ''
    bmPinConfirm.value = ''
    bmPinOk.value = true
  } catch (e) {
    bmPinError.value = (e as Error).message
  } finally {
    bmPinBusy.value = false
  }
}

async function onChangeAccountPassword(): Promise<void> {
  acctPwError.value = null
  acctPwOk.value = false
  const cur = acctPwCurrent.value
  const next = acctPwNew.value
  const again = acctPwConfirm.value

  if (!cur || !next || !again) {
    acctPwError.value = t('settings.pwErrFill')
    return
  }
  if (next !== again) {
    acctPwError.value = t('settings.pwErrMismatch')
    return
  }
  if (next === cur) {
    acctPwError.value = t('settings.pwErrSame')
    return
  }
  const issueKeys = accountPasswordIssues(next, { email: auth.user?.email ?? null })
  if (issueKeys.length > 0) {
    acctPwError.value = t(issueKeys[0]!)
    return
  }

  acctPwBusy.value = true
  try {
    await auth.changeAccountPassword(cur, next)
    acctPwCurrent.value = ''
    acctPwNew.value = ''
    acctPwConfirm.value = ''
    acctPwOk.value = true
  } catch (e) {
    acctPwError.value = e instanceof Error ? e.message : t('settings.pwErrFailed')
  } finally {
    acctPwBusy.value = false
  }
}

function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

watch([acctPwCurrent, acctPwNew, acctPwConfirm], () => {
  acctPwOk.value = false
})

watch([bmPinOld, bmPinNew, bmPinConfirm], () => {
  bmPinOk.value = false
})

watch(bmPinRemoveCurrent, () => {
  bmPinRemoveOk.value = false
  bmPinRemoveError.value = null
})

watch([bmPinSetupNew, bmPinSetupConfirm], () => {
  bmPinSetupOk.value = false
})

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
  void bookmarkPin.loadCryptoState()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true)
})
</script>

<template>
  <div
    class="settings-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
  >
    <div class="settings-backdrop" @click="emit('close')" />
    <div class="settings-panel">
      <div class="settings-header">
        <h2 id="settings-title" class="settings-title">
          {{ t('settings.title') }}
        </h2>
        <p
          v-if="auth.isAuthenticated && auth.user?.email"
          class="settings-header-email"
          :title="t('settings.signedInAs', { email: auth.user.email })"
        >
          {{ auth.user.email }}
        </p>
      </div>

      <div class="settings-scroll">
        <!-- Language selection -->
        <SettingsAccordionSection :title="t('settings.language')" :default-open="true">
          <p class="settings-hint">{{ t('settings.languageDesc') }}</p>
          <div class="settings-row settings-lang-row">
            <RetroButton
              variant="sm"
              type="button"
              class="settings-lang-btn"
              :disabled="langStore.lang === 'en'"
              :aria-label="t('settings.langEN')"
              :aria-current="langStore.lang === 'en' ? 'true' : undefined"
              @click="langStore.setLang('en')"
            >
              <LangFlagIcon locale="en" />
            </RetroButton>
            <RetroButton
              variant="sm"
              type="button"
              class="settings-lang-btn"
              :disabled="langStore.lang === 'vi'"
              :aria-label="t('settings.langVI')"
              :aria-current="langStore.lang === 'vi' ? 'true' : undefined"
              @click="langStore.setLang('vi')"
            >
              <LangFlagIcon locale="vi" />
            </RetroButton>
          </div>
        </SettingsAccordionSection>

        <SettingsAccordionSection :title="t('settings.timezone')" :default-open="true">
          <p class="settings-hint">{{ t('settings.timezoneDesc') }}</p>
          <p class="settings-hint settings-hint--sub">{{ utcOffsetCurrentHint }}</p>
          <label class="settings-field-label" for="set-utc-offset">
            {{ t('settings.timezoneOffset') }}
          </label>
          <select
            id="set-utc-offset"
            class="settings-utc-select"
            :value="utcOffsetHours"
            @change="onUtcOffsetChange"
          >
            <option v-for="h in UTC_OFFSET_OPTIONS" :key="h" :value="h">
              {{ formatUtcOffsetLabel(h) }}
            </option>
          </select>
        </SettingsAccordionSection>

        <SettingsAccordionSection
          v-if="auth.isAuthenticated"
          :title="t('settings.accountPassword')"
          :default-open="false"
        >
          <p class="settings-hint settings-hint--sub">
            {{ t('settings.pwHint') }}
          </p>
          <label class="settings-field-label" for="set-acct-pw-current">
            {{ t('settings.pwCurrent') }}
          </label>
          <RetroInput
            id="set-acct-pw-current"
            v-model="acctPwCurrent"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            :disabled="acctPwBusy"
          />
          <label class="settings-field-label" for="set-acct-pw-new">
            {{ t('settings.pwNew') }}
          </label>
          <RetroInput
            id="set-acct-pw-new"
            v-model="acctPwNew"
            type="password"
            autocomplete="new-password"
            :placeholder="t('settings.pwNewPlaceholder')"
            :disabled="acctPwBusy"
          />
          <ul
            v-if="acctPwNew.length > 0 && acctPwIssueKeys.length > 0"
            class="settings-pw-issues"
            role="status"
          >
            <li v-for="(key, i) in acctPwIssueKeys" :key="i">
              {{ t(key) }}
            </li>
          </ul>
          <label class="settings-field-label" for="set-acct-pw-confirm">
            {{ t('settings.pwConfirm') }}
          </label>
          <RetroInput
            id="set-acct-pw-confirm"
            v-model="acctPwConfirm"
            type="password"
            autocomplete="new-password"
            placeholder="••••••••"
            :disabled="acctPwBusy"
          />
          <p v-if="acctPwError" class="settings-pin-err" role="alert">
            {{ acctPwError }}
          </p>
          <p v-else-if="acctPwOk" class="settings-pin-ok">
            {{ t('settings.pwOk') }}
          </p>
          <div class="settings-row settings-row--pin">
            <RetroButton
              variant="sm"
              type="button"
              :disabled="!acctPwCanSubmit"
              @click="onChangeAccountPassword"
            >
              {{ t('settings.pwSubmit') }}
            </RetroButton>
          </div>
        </SettingsAccordionSection>

        <!-- Chưa đặt PIN: Setup tùy chọn -->
        <SettingsAccordionSection
          v-if="auth.isAuthenticated && !bookmarkPin.hasCryptoSetup"
          :title="t('settings.pinSetupTitle')"
          :default-open="false"
        >
          <p class="settings-hint settings-hint--sub">
            {{ t('settings.pinSetupHint') }}
          </p>
          <label class="settings-field-label" for="set-bm-setup-new">
            {{ t('settings.pinSetupNew') }}
          </label>
          <RetroInput
            id="set-bm-setup-new"
            :model-value="bmPinSetupNew"
            type="password"
            digit-only
            autocomplete="new-password"
            :placeholder="t('pin.digits69Placeholder')"
            :disabled="bmPinSetupBusy"
            :maxlength="9"
            @update:model-value="bmPinSetupNew = bmDigits($event, 9)"
          />
          <label class="settings-field-label" for="set-bm-setup-confirm">
            {{ t('settings.pinSetupConfirm') }}
          </label>
          <RetroInput
            id="set-bm-setup-confirm"
            :model-value="bmPinSetupConfirm"
            type="password"
            digit-only
            autocomplete="new-password"
            :placeholder="t('pin.digits69Placeholder')"
            :disabled="bmPinSetupBusy"
            :maxlength="9"
            @update:model-value="bmPinSetupConfirm = bmDigits($event, 9)"
          />
          <p v-if="bmPinSetupError" class="settings-pin-err">{{ bmPinSetupError }}</p>
          <p v-else-if="bmPinSetupOk" class="settings-pin-ok">{{ t('settings.pinSetupOk') }}</p>
          <div class="settings-row settings-row--pin">
            <RetroButton
              variant="sm"
              type="button"
              :disabled="bmPinSetupBusy"
              @click="onSetupBookmarkPin"
            >
              {{ t('settings.pinSetupBtn') }}
            </RetroButton>
          </div>
        </SettingsAccordionSection>

        <!-- Đã đặt PIN: Change PIN + Remove PIN -->
        <SettingsAccordionSection
          v-if="auth.isAuthenticated && bookmarkPin.hasCryptoSetup"
          :title="t('settings.bookmarkPin')"
          :default-open="false"
        >
          <!-- Change PIN -->
          <p class="settings-hint settings-hint--sub">
            {{ t('settings.pinHint') }}
          </p>
          <label class="settings-field-label" for="set-bm-pin-old">
            {{ t('settings.pinOld') }}
          </label>
          <RetroInput
            id="set-bm-pin-old"
            :model-value="bmPinOld"
            type="password"
            digit-only
            autocomplete="current-password"
            :placeholder="t('pin.digits69Placeholder')"
            :disabled="bmPinBusy"
            :maxlength="9"
            @update:model-value="bmPinOld = bmDigits($event, 9)"
          />
          <label class="settings-field-label" for="set-bm-pin-new">
            {{ t('settings.pinNew') }}
          </label>
          <RetroInput
            id="set-bm-pin-new"
            :model-value="bmPinNew"
            type="password"
            digit-only
            autocomplete="new-password"
            :placeholder="t('pin.digits69Placeholder')"
            :disabled="bmPinBusy"
            :maxlength="9"
            @update:model-value="bmPinNew = bmDigits($event, 9)"
          />
          <label class="settings-field-label" for="set-bm-pin-confirm">
            {{ t('settings.pinConfirm') }}
          </label>
          <RetroInput
            id="set-bm-pin-confirm"
            :model-value="bmPinConfirm"
            type="password"
            digit-only
            autocomplete="new-password"
            :placeholder="t('pin.digits69Placeholder')"
            :disabled="bmPinBusy"
            :maxlength="9"
            @update:model-value="bmPinConfirm = bmDigits($event, 9)"
          />
          <p v-if="bmPinError" class="settings-pin-err">{{ bmPinError }}</p>
          <p v-else-if="bmPinOk" class="settings-pin-ok">{{ t('settings.pinOk') }}</p>
          <div class="settings-row settings-row--pin">
            <RetroButton
              variant="sm"
              type="button"
              :disabled="bmPinBusy"
              @click="onChangeBookmarkPin"
            >
              {{ t('settings.pinSubmit') }}
            </RetroButton>
          </div>

          <!-- Divider -->
          <div class="settings-divider" />

          <!-- Remove PIN section -->
          <p class="settings-field-label settings-field-label--section">
            {{ t('settings.pinRemoveTitle') }}
          </p>
          <p class="settings-hint settings-hint--sub settings-hint--danger">
            {{ t('settings.pinRemoveHint') }}
          </p>
          <label class="settings-field-label" for="set-bm-pin-remove-cur">
            {{ t('settings.pinRemoveCurrent') }}
          </label>
          <RetroInput
            id="set-bm-pin-remove-cur"
            :model-value="bmPinRemoveCurrent"
            type="password"
            digit-only
            autocomplete="current-password"
            :placeholder="t('pin.digits69Placeholder')"
            :disabled="bmPinRemoveBusy"
            :maxlength="9"
            @update:model-value="bmPinRemoveCurrent = bmDigits($event, 9)"
          />
          <p v-if="bmPinRemoveError" class="settings-pin-err">{{ bmPinRemoveError }}</p>
          <p v-else-if="bmPinRemoveOk" class="settings-pin-ok">{{ t('settings.pinRemoveOk') }}</p>
          <div class="settings-row settings-row--pin">
            <RetroButton
              variant="sm"
              type="button"
              class="settings-btn--danger"
              :disabled="bmPinRemoveBusy"
              @click="onRemoveBookmarkPin"
            >
              {{ t('settings.pinRemoveBtn') }}
            </RetroButton>
          </div>
        </SettingsAccordionSection>
      </div>

      <p class="settings-version">
        {{ t('settings.version', { version: extensionVersion }) }}
      </p>
      <RetroButton type="button" class="settings-close" @click="emit('close')">
        {{ t('settings.closeBtn') }}
      </RetroButton>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
}

.settings-backdrop {
  position: absolute;
  inset: 0;
  background: var(--overlay-scrim);
}

.settings-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-width: 320px;
  max-width: 100%;
  width: min(100%, 480px);
  max-height: min(90vh, 420px);
  padding: 11px 12px 12px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  box-shadow: 0 0 0 1px var(--accent);
}

.settings-title {
  margin: 0;
  flex-shrink: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.settings-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px 12px;
  margin-bottom: 8px;
  flex-shrink: 0;
  min-width: 0;
}

.settings-header-email {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(220px, 58%);
  text-align: right;
}

.settings-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin-right: -2px;
  padding-right: 2px;
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 0;
}

.settings-utc-select {
  display: block;
  width: 100%;
  max-width: 200px;
  margin: 0 0 4px;
  padding: 6px 8px;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.settings-utc-select:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.settings-row--pin {
  margin-top: 8px;
}

.settings-hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}

.settings-hint--sub {
  margin-bottom: 8px;
  font-size: 10px;
}

.settings-field-label {
  display: block;
  margin: 6px 0 3px;
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.settings-field-label:first-of-type {
  margin-top: 0;
}

.settings-pw-issues {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 11px;
  color: var(--danger);
  line-height: 1.45;
}

.settings-pin-err {
  margin: 8px 0 0;
  font-size: var(--font-size-sm);
  color: var(--danger);
}

.settings-pin-ok {
  margin: 8px 0 0;
  font-size: var(--font-size-sm);
  color: var(--accent);
}

.settings-close {
  flex-shrink: 0;
  width: 100%;
  margin-top: 6px;
}

.settings-version {
  flex-shrink: 0;
  margin: 10px 0 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-align: center;
}

.settings-divider {
  margin: 14px 0 10px;
  border: none;
  border-top: 1px solid var(--border);
}

.settings-field-label--section {
  margin-top: 0;
  font-size: 11px;
  color: var(--text-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings-hint--danger {
  color: var(--danger);
  opacity: 0.8;
}

.settings-btn--danger {
  border-color: var(--danger) !important;
  color: var(--danger) !important;
}

.settings-btn--danger:hover:not(:disabled) {
  background: var(--surface-danger-muted) !important;
}

.settings-lang-row {
  gap: 8px;
}

.settings-lang-row :deep(.settings-lang-btn) {
  width: 48px;
  min-width: 48px;
  padding: 6px;
}

</style>
