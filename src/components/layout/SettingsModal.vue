<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import TranslationSettingsPanel from '@/components/dictionary/TranslationSettingsPanel.vue'
import SettingsAccordionSection from '@/components/layout/SettingsAccordionSection.vue'
import { useAuthStore } from '@/stores/auth'
import { useBookmarkPinStore } from '@/stores/bookmarkPin'
import { useSettingsStore, type FontSizePx } from '@/stores/settings'
import { useLangStore } from '@/stores/uiLang'
import { accountPasswordIssues } from '@/utils/accountPasswordValidation'
import { bookmarkPinWeakReason } from '@/utils/bookmarkPinValidation'

const emit = defineEmits<{ close: [] }>()

const auth = useAuthStore()
const settings = useSettingsStore()
const bookmarkPin = useBookmarkPinStore()
const langStore = useLangStore()
const { t } = langStore

const sizes: FontSizePx[] = [11, 13, 15]

const bmPinOld = ref('')
const bmPinNew = ref('')
const bmPinConfirm = ref('')
const bmPinBusy = ref(false)
const bmPinError = ref<string | null>(null)
const bmPinOk = ref(false)

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

function pick(px: FontSizePx): void {
  void settings.setFontSize(px)
}

function bmDigits(s: string, max: number): string {
  const d = s.replace(/\D/g, '')
  const n = Math.floor(Number(max))
  const limit = Number.isFinite(n) && n >= 1 ? n : 9
  return d.slice(0, limit)
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
    <div class="settings-panel crt-scanlines">
      <h2 id="settings-title" class="settings-title">
        {{ t('settings.title') }}
      </h2>

      <div class="settings-scroll">
        <!-- Language selection -->
        <SettingsAccordionSection :title="t('settings.language')" :default-open="true">
          <p class="settings-hint">{{ t('settings.languageDesc') }}</p>
          <div class="settings-row settings-lang-row">
            <RetroButton
              variant="sm"
              type="button"
              :disabled="langStore.lang === 'en'"
              @click="langStore.setLang('en')"
            >
              🇬🇧 {{ t('settings.langEN') }}
            </RetroButton>
            <RetroButton
              variant="sm"
              type="button"
              :disabled="langStore.lang === 'vi'"
              @click="langStore.setLang('vi')"
            >
              🇻🇳 {{ t('settings.langVI') }}
            </RetroButton>
          </div>
        </SettingsAccordionSection>

        <SettingsAccordionSection :title="t('settings.fontSize')" :default-open="true">
          <div class="settings-row">
            <RetroButton
              v-for="px in sizes"
              :key="px"
              variant="sm"
              type="button"
              :disabled="settings.fontSizePx === px"
              @click="pick(px)"
            >
              [ {{ px }} ]
            </RetroButton>
          </div>
        </SettingsAccordionSection>

        <SettingsAccordionSection :title="t('settings.translation')" :default-open="true">
          <TranslationSettingsPanel />
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

        <SettingsAccordionSection
          v-if="bookmarkPin.hasCryptoSetup"
          :title="t('settings.bookmarkPin')"
          :default-open="false"
        >
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
        </SettingsAccordionSection>
      </div>

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
  background: rgba(13, 13, 6, 0.75);
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
  margin: 0 0 8px;
  flex-shrink: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.settings-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin-right: -2px;
  padding-right: 2px;
}

/* Thu gọn block dịch trong Settings */
.settings-scroll :deep(.tsp__desc) {
  margin-bottom: 8px;
  font-size: 10px;
}

.settings-scroll :deep(.tsp__section) {
  margin-bottom: 8px;
}

.settings-scroll :deep(.tsp__label) {
  margin-bottom: 4px;
}

.settings-scroll :deep(.tsp__checks) {
  gap: 4px 10px;
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 0;
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
  margin-top: 10px;
}

.settings-lang-row {
  gap: 8px;
}
</style>
