<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import LangFlagIcon from '@/components/ui/LangFlagIcon.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import SettingsAccordionSection from '@/components/layout/SettingsAccordionSection.vue'
import AccountEncryptionSetupModal from '@/components/account/AccountEncryptionSetupModal.vue'
import BackupSettingsSection from '@/components/backup/BackupSettingsSection.vue'
import { useAuthStore } from '@/stores/auth'
import { useAccountCryptoStore } from '@/stores/accountCrypto'
import { useLangStore } from '@/stores/uiLang'
import { getExtensionVersion } from '@/utils/extensionVersion'
import { accountPasswordIssues } from '@/utils/accountPasswordValidation'
import { calendarFeedService, type CalendarFeedInfo } from '@/services/calendarFeed.service'
import { FEATURES } from '@/constants/features'
import { copyTextToClipboard } from '@/utils/clipboard'

const props = defineProps<{
  /** B1: App.vue mở Cài đặt từ route `?restore=1` (chọn file) / `?restore=done` (vừa khôi phục). */
  backupFocus?: 'restore' | 'done' | null
}>()

const emit = defineEmits<{ close: []; 'lock-account': [] }>()

/** B1: hộp xem trước / xác nhận khôi phục đang mở — Esc chỉ đóng hộp đó, không đóng cả Cài đặt. */
const backupLayerOpen = ref(false)

const auth = useAuthStore()
const accountCrypto = useAccountCryptoStore()
const langStore = useLangStore()
const { t } = langStore

const extensionVersion = getExtensionVersion()

const LANG_OPTIONS = [
  { code: 'en', labelKey: 'settings.langEN' },
  { code: 'vi', labelKey: 'settings.langVI' },
] as const

const acctPwCurrent = ref('')
const acctPwNew = ref('')
const acctPwConfirm = ref('')
const acctPwBusy = ref(false)
const acctPwError = ref<string | null>(null)
const acctPwOk = ref(false)

const showAccountSetup = ref(false)

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
  // Hộp xác nhận "Tạo link mới" đang mở: Esc chỉ đóng hộp đó (C12), không đóng cả Settings.
  if (e.key === 'Escape' && !gcalConfirmRotate.value && !backupLayerOpen.value) emit('close')
}

// ── G1: link Google Calendar (một chiều) — mỗi user một link riêng ──
const gcalFeed = ref<CalendarFeedInfo | null>(null)
const gcalLoaded = ref(false)
const gcalBusy = ref(false)
const gcalError = ref<string | null>(null)
const gcalCopied = ref(false)
const gcalConfirmRotate = ref(false)

async function loadGcalFeed(): Promise<void> {
  gcalError.value = null
  try {
    gcalFeed.value = await calendarFeedService.get()
  } catch (e) {
    console.error(e)
    gcalError.value = t('settings.gcal.error')
  } finally {
    gcalLoaded.value = true
  }
}

async function runGcal(action: () => Promise<CalendarFeedInfo>): Promise<void> {
  gcalBusy.value = true
  gcalError.value = null
  try {
    gcalFeed.value = await action()
  } catch (e) {
    console.error(e)
    gcalError.value = t('settings.gcal.error')
  } finally {
    gcalBusy.value = false
  }
}

function onGcalCreate(): void {
  void runGcal(() => calendarFeedService.createOrRotate())
}

function onGcalToggle(): void {
  const feed = gcalFeed.value
  if (feed) void runGcal(() => calendarFeedService.setEnabled(!feed.enabled))
}

async function onGcalCopy(): Promise<void> {
  if (!gcalFeed.value) return
  gcalCopied.value = await copyTextToClipboard(gcalFeed.value.url)
  if (gcalCopied.value) setTimeout(() => (gcalCopied.value = false), 2000)
}

watch([acctPwCurrent, acctPwNew, acctPwConfirm], () => {
  acctPwOk.value = false
})

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
  if (auth.isAuthenticated) {
    // Lỗi mạng: giữ trạng thái đang có, không để unhandled rejection.
    accountCrypto.refreshStatus().catch(() => {})
    void loadGcalFeed()
  }
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
    <div class="settings-backdrop" @mousedown.prevent />
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
          <!-- U9: cờ chữ nhật, không bọc trong nút pill; tên ngôn ngữ ở aria-label + tooltip. -->
          <div class="settings-row settings-lang-row" role="radiogroup" :aria-label="t('settings.language')">
            <button
              v-for="opt in LANG_OPTIONS"
              :key="opt.code"
              type="button"
              role="radio"
              class="settings-lang-option"
              :class="{ 'settings-lang-option--active': langStore.lang === opt.code }"
              :aria-checked="langStore.lang === opt.code"
              :aria-label="t(opt.labelKey)"
              :title="t(opt.labelKey)"
              @click="langStore.setLang(opt.code)"
            >
              <span class="settings-lang-flag"><LangFlagIcon :locale="opt.code" /></span>
            </button>
          </div>
        </SettingsAccordionSection>

        <!-- B1: sao lưu ra file — người không đăng nhập; FEATURES.backupFileSignedIn bật thì người đăng nhập chỉ tải. -->
        <BackupSettingsSection
          v-if="!auth.isAuthenticated || FEATURES.backupFileSignedIn"
          :signed-in="auth.isAuthenticated"
          :focus="props.backupFocus ?? null"
          @layer-open="backupLayerOpen = $event"
        />

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

        <!-- S3b: tạm ẩn (FEATURES.accountEncryptionSettings) — S3 hoãn, Sir nghiên cứu thêm. -->
        <SettingsAccordionSection
          v-if="FEATURES.accountEncryptionSettings && auth.isAuthenticated"
          :title="t('account.settingsTitle')"
          :default-open="false"
        >
          <!-- S2C1.5: chưa xác nhận với server → KHÔNG cho bật (có thể đè DEK đã có). -->
          <p
            v-if="!accountCrypto.isEnabled() && (!accountCrypto.fetched || accountCrypto.stale)"
            class="settings-hint settings-hint--sub"
          >
            {{ t('account.statusUnknown') }}
          </p>
          <template v-else-if="!accountCrypto.isEnabled()">
            <p class="settings-hint settings-hint--sub">
              {{ t('account.setupIntro') }}
            </p>
            <div class="settings-row settings-row--pin">
              <RetroButton
                variant="sm"
                type="button"
                @click="showAccountSetup = true"
              >
                {{ t('account.enableCta') }}
              </RetroButton>
            </div>
          </template>
          <template v-else>
            <p class="settings-hint settings-hint--sub">
              {{
                accountCrypto.isUnlocked()
                  ? t('account.statusUnlocked')
                  : t('account.statusLocked')
              }}
            </p>
            <div v-if="!accountCrypto.isUnlocked()" class="settings-row settings-row--pin">
              <RetroButton
                variant="sm"
                type="button"
                @click="accountCrypto.unlockModalOpen = true"
              >
                <AppIcon name="unlock" :size="15" />
                {{ t('account.unlock') }}
              </RetroButton>
            </div>
            <div v-else class="settings-row settings-row--pin">
              <RetroButton variant="sm" type="button" @click="emit('lock-account')">
                <AppIcon name="lock" :size="15" />
                {{ t('account.lockNow') }}
              </RetroButton>
            </div>
          </template>
        </SettingsAccordionSection>

        <!-- G1: link Google Calendar (một chiều BBQOne → Google) — mỗi user một link riêng. -->
        <SettingsAccordionSection
          v-if="auth.isAuthenticated"
          :title="t('settings.gcal.title')"
          :default-open="false"
        >
          <p class="settings-hint settings-hint--sub">{{ t('settings.gcal.desc') }}</p>
          <p v-if="gcalError" class="settings-pin-err" role="alert">{{ gcalError }}</p>
          <div v-if="gcalLoaded && !gcalFeed" class="settings-row settings-row--pin">
            <RetroButton variant="sm" type="button" primary :disabled="gcalBusy" @click="onGcalCreate">
              <AppIcon name="link" :size="15" />
              {{ t('settings.gcal.create') }}
            </RetroButton>
          </div>
          <template v-else-if="gcalFeed">
            <div class="settings-gcal-url" :class="{ 'settings-gcal-url--off': !gcalFeed.enabled }">
              <input
                class="settings-gcal-url__input"
                type="text"
                readonly
                :value="gcalFeed.url"
                :aria-label="t('settings.gcal.title')"
                @focus="($event.target as HTMLInputElement).select()"
              />
              <button
                type="button"
                class="ds-icon-action"
                :aria-label="t('settings.gcal.copy')"
                :title="gcalCopied ? t('settings.gcal.copied') : t('settings.gcal.copy')"
                :disabled="!gcalFeed.enabled"
                @click="onGcalCopy"
              >
                <!-- Cùng icon + cỡ với nút sao chép section bên Ghi chú (NoteEditor). -->
                <AppIcon v-if="gcalCopied" name="check" :size="15" />
                <AppIcon v-else name="copy" :size="15" />
              </button>
            </div>
            <p v-if="!gcalFeed.enabled" class="settings-hint settings-hint--danger">{{ t('settings.gcal.disabledHint') }}</p>
            <ol class="settings-gcal-steps">
              <li>{{ t('settings.gcal.step1') }}</li>
              <li>{{ t('settings.gcal.step2') }}</li>
            </ol>
            <p class="settings-gcal-warn">
              <AppIcon name="alert" :size="14" />
              {{ t('settings.gcal.warnPublic') }}
            </p>
            <p class="settings-hint">{{ t('settings.gcal.warnDelay') }}</p>
            <div class="settings-row settings-row--pin">
              <RetroButton variant="sm" type="button" :disabled="gcalBusy" @click="gcalConfirmRotate = true">
                <AppIcon name="refresh" :size="15" />
                {{ t('settings.gcal.rotate') }}
              </RetroButton>
              <RetroButton variant="sm" type="button" :disabled="gcalBusy" @click="onGcalToggle">
                {{ gcalFeed.enabled ? t('settings.gcal.disable') : t('settings.gcal.enable') }}
              </RetroButton>
            </div>
          </template>
        </SettingsAccordionSection>
        <RetroConfirm
          v-model:open="gcalConfirmRotate"
          :message="t('settings.gcal.rotateConfirm')"
          @confirm="onGcalCreate"
        />

      </div>

      <!-- U11: chân trang phẳng — phiên bản (chữ phụ) + "Đóng" (nút chữ). -->
      <div class="settings-footer">
        <p class="settings-version">
          {{ t('settings.version', { version: extensionVersion }) }}
        </p>
        <button type="button" class="ds-text-action settings-close" @click="emit('close')">
          {{ t('settings.closeBtn') }}
        </button>
      </div>
    </div>
  </div>
  <AccountEncryptionSetupModal
    v-if="FEATURES.accountEncryptionSettings"
    :open="showAccountSetup"
    @close="showAccountSetup = false"
    @done="showAccountSetup = false"
  />
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
  max-height: min(90vh, 520px);
  padding: 14px 14px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  box-shadow: 0 18px 48px var(--panel-ring);
  overflow: hidden;
}

.settings-title {
  margin: 0;
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.settings-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px 12px;
  margin: 0 0 6px;
  padding: 0 6px 8px;
  flex-shrink: 0;
  min-width: 0;
}

.settings-header-email {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(240px, 60%);
  text-align: right;
}

.settings-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin-right: -4px;
  padding-right: 4px;
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
  margin: 8px 0 4px;
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
  padding: 8px 10px 8px 26px;
  font-size: 11px;
  color: var(--danger);
  line-height: 1.45;
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
}

.settings-pin-err {
  margin: 8px 0 0;
  padding: 7px 9px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
}

.settings-pin-ok {
  margin: 8px 0 0;
  padding: 7px 9px;
  font-size: var(--font-size-sm);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 34%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--success) 10%, var(--bg-secondary));
}

.settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
  margin-top: 6px;
  padding: 8px 2px 0 6px;
  border-top: 1px solid var(--border);
}

.settings-close {
  flex-shrink: 0;
}

.settings-version {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
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

.settings-gcal-url {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 6px 0 8px;
  padding: 2px 4px 2px 0;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
}

.settings-gcal-url--off {
  opacity: 0.55;
}

.settings-gcal-url__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  text-overflow: ellipsis;
}

.settings-gcal-url__input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 0;
  border-radius: var(--radius-sm);
}

.settings-gcal-steps {
  margin: 0 0 8px;
  padding-left: 18px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.settings-gcal-warn {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--danger);
}

.settings-gcal-warn :deep(.app-icon) {
  margin-top: 1px;
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
  gap: 14px;
}

.settings-lang-option {
  display: inline-flex;
  margin: 0;
  padding: 2px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.settings-lang-flag {
  display: inline-flex;
  padding: 3px;
  border: 2px solid transparent;
  border-radius: 5px;
  transition:
    border-color 0.12s linear,
    transform 0.12s ease;
}

.settings-lang-option:hover .settings-lang-flag {
  border-color: var(--border);
  transform: translateY(-1px);
}

.settings-lang-option--active .settings-lang-flag,
.settings-lang-option--active:hover .settings-lang-flag {
  border-color: var(--accent);
}

.settings-lang-option:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .settings-lang-flag {
    transition: none;
  }
}

</style>
