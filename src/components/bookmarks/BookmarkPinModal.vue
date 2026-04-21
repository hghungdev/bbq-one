<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import PinKeypad from '@/components/bookmarks/PinKeypad.vue'
import { useBookmarkPinStore } from '@/stores/bookmarkPin'
import { useLangStore } from '@/stores/uiLang'

const props = defineProps<{
  mode: 'setup' | 'unlock'
}>()

const emit = defineEmits<{
  done: []
}>()

const pin = useBookmarkPinStore()
const { t } = useLangStore()

const pinLen = ref<6 | 9>(6)
const pinSetup = ref('')
const pinConfirm = ref('')
const pinUnlock = ref('')
const busy = ref(false)
const formError = ref<string | null>(null)

/** Bàn phím số tùy chọn — mặc định mở trên thiết bị cảm ứng. */
const showKeypad = ref(false)
/** Ô PIN đang nhận số từ keypad (đặt PIN). */
const setupActiveField = ref<'pin' | 'confirm'>('pin')
/** Đổi key để xáo lại vị trí số trên keypad. */
const keypadShuffleKey = ref(0)

/** Tick 1s để đếm ngược lockout. */
const tick = ref(0)
let tickTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
    showKeypad.value = true
  }
  tickTimer = setInterval(() => {
    tick.value++
  }, 1000)
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
})

const lockoutSecondsLeft = computed((): number => {
  void tick.value
  const until = pin.lockoutUntil
  if (Date.now() >= until) return 0
  return Math.ceil((until - Date.now()) / 1000)
})

const isLockedOut = computed(() => lockoutSecondsLeft.value > 0)

const patternOkSetup = (s: string): boolean => {
  if (pinLen.value === 6) return /^\d{6}$/.test(s)
  return /^\d{9}$/.test(s)
}

const patternOkUnlock = (s: string): boolean =>
  /^\d{6}$/.test(s) || /^\d{9}$/.test(s)

/** Chỉ giữ chữ số; max phải dương — tránh slice(0, undefined) kéo dài cả chuỗi. */
function digitsOnly(s: string, max: number): string {
  const d = s.replace(/\D/g, '')
  const n = Math.floor(Number(max))
  const limit = Number.isFinite(n) && n >= 1 ? n : 9
  return d.slice(0, limit)
}

function onSetupPinInput(v: string): void {
  pinSetup.value = digitsOnly(v, pinLen.value)
}

function onSetupConfirmInput(v: string): void {
  pinConfirm.value = digitsOnly(v, pinLen.value)
}

function onUnlockPinInput(v: string): void {
  pinUnlock.value = digitsOnly(v, 9)
}

function appendKeypadDigit(d: string): void {
  if (props.mode === 'setup') {
    if (setupActiveField.value === 'pin') {
      onSetupPinInput(pinSetup.value + d)
    } else {
      onSetupConfirmInput(pinConfirm.value + d)
    }
  } else {
    onUnlockPinInput(pinUnlock.value + d)
  }
}

function keypadBackspace(): void {
  if (props.mode === 'setup') {
    if (setupActiveField.value === 'pin') {
      onSetupPinInput(pinSetup.value.slice(0, -1))
    } else {
      onSetupConfirmInput(pinConfirm.value.slice(0, -1))
    }
  } else {
    onUnlockPinInput(pinUnlock.value.slice(0, -1))
  }
}

function shuffleKeypadLayout(): void {
  keypadShuffleKey.value++
}

watch(pinLen, () => {
  pinSetup.value = digitsOnly(pinSetup.value, pinLen.value)
  pinConfirm.value = digitsOnly(pinConfirm.value, pinLen.value)
})

watch(
  () => props.mode,
  () => {
    formError.value = null
    pinSetup.value = ''
    pinConfirm.value = ''
    pinUnlock.value = ''
    setupActiveField.value = 'pin'
    keypadShuffleKey.value++
  },
)

async function onSubmitSetup(): Promise<void> {
  formError.value = null
  if (!patternOkSetup(pinSetup.value) || !patternOkSetup(pinConfirm.value)) {
    formError.value = t('pin.errLengthN', { n: pinLen.value })
    return
  }
  if (pinSetup.value !== pinConfirm.value) {
    formError.value = t('pin.errMismatch')
    return
  }
  busy.value = true
  try {
    await pin.setupPin(pinSetup.value)
    emit('done')
  } catch (e) {
    formError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function onSubmitUnlock(): Promise<void> {
  formError.value = null
  if (isLockedOut.value) return
  if (!patternOkUnlock(pinUnlock.value)) {
    formError.value = t('pin.errLengthAny')
    return
  }
  busy.value = true
  try {
    const ok = await pin.tryUnlock(pinUnlock.value)
    if (!ok) {
      if (pin.lockoutUntil > Date.now()) {
        formError.value = t('pin.errTooMany')
      } else {
        const left = 3 - pin.failedAttempts
        formError.value =
          left > 0 ? t('pin.errWrongN', { n: left }) : t('pin.errWrong')
      }
      pinUnlock.value = ''
      return
    }
    emit('done')
  } catch (e) {
    formError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const attemptsLeft = computed(() => {
  void tick.value
  if (pin.lockoutUntil > Date.now()) return 0
  return Math.max(0, 3 - pin.failedAttempts)
})
</script>

<template>
  <Teleport to="body">
    <div class="bm-pin__backdrop bbqnote-overlay" role="presentation">
      <div
        class="bm-pin"
        :class="{ 'bm-pin--wide': showKeypad }"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
      >
        <template v-if="props.mode === 'setup'">
          <p class="bm-pin__title">{{ t('pin.setup.title') }}</p>
          <p class="bm-pin__hint">{{ t('pin.setup.hint') }}</p>
          <div class="bm-pin__row">
            <label class="bm-pin__label">{{ t('pin.setup.length') }}</label>
            <label class="bm-pin__radio">
              <input v-model.number="pinLen" type="radio" :value="6" :disabled="busy">
              {{ t('pin.setup.digits6') }}
            </label>
            <label class="bm-pin__radio">
              <input v-model.number="pinLen" type="radio" :value="9" :disabled="busy">
              {{ t('pin.setup.digits9') }}
            </label>
          </div>
          <label class="bm-pin__label" for="bm-pin-a">{{ t('pin.label') }}</label>
          <RetroInput
            id="bm-pin-a"
            :model-value="pinSetup"
            type="password"
            digit-only
            autocomplete="new-password"
            :placeholder="t('pin.digitsPlaceholder', { n: pinLen })"
            :disabled="busy"
            :maxlength="pinLen"
            @focus="setupActiveField = 'pin'"
            @update:model-value="onSetupPinInput"
          />
          <label class="bm-pin__label" for="bm-pin-b">{{ t('pin.confirmLabel') }}</label>
          <RetroInput
            id="bm-pin-b"
            :model-value="pinConfirm"
            type="password"
            digit-only
            autocomplete="new-password"
            :placeholder="t('pin.digitsPlaceholder', { n: pinLen })"
            :disabled="busy"
            :maxlength="pinLen"
            @focus="setupActiveField = 'confirm'"
            @update:model-value="onSetupConfirmInput"
          />
          <div class="bm-pin__keypad-bar">
            <button
              type="button"
              class="bm-pin__keypad-toggle"
              :disabled="busy"
              @click="showKeypad = !showKeypad"
            >
              {{ showKeypad ? t('pin.hideKeypad') : t('pin.showKeypad') }}
            </button>
            <button
              v-if="showKeypad"
              type="button"
              class="bm-pin__keypad-toggle"
              :disabled="busy"
              @click="shuffleKeypadLayout"
            >
              {{ t('pin.shuffleKeypad') }}
            </button>
          </div>
          <PinKeypad
            v-if="showKeypad"
            :key="keypadShuffleKey"
            :disabled="busy"
            @digit="appendKeypadDigit"
            @backspace="keypadBackspace"
          />
          <p v-if="formError" class="bm-pin__err">{{ formError }}</p>
          <div class="bm-pin__actions">
            <RetroButton variant="sm" :disabled="busy" @click="onSubmitSetup">
              {{ t('pin.confirmBtn') }}
            </RetroButton>
          </div>
        </template>

        <template v-else>
          <p class="bm-pin__title">{{ t('pin.unlock.title') }}</p>
          <p class="bm-pin__hint">{{ t('pin.unlock.hint') }}</p>
          <p v-if="isLockedOut" class="bm-pin__lock">
            {{ t('pin.lockoutMsg', { s: lockoutSecondsLeft }) }}
          </p>
          <p v-else-if="attemptsLeft < 3 && attemptsLeft > 0" class="bm-pin__warn">
            {{ t('pin.attemptsLeft', { n: attemptsLeft }) }}
          </p>
          <label class="bm-pin__label" for="bm-pin-u">{{ t('pin.label') }}</label>
          <RetroInput
            id="bm-pin-u"
            :model-value="pinUnlock"
            type="password"
            digit-only
            autocomplete="current-password"
            :placeholder="t('pin.digits69Placeholder')"
            :disabled="busy || isLockedOut"
            :maxlength="9"
            @update:model-value="onUnlockPinInput"
          />
          <div class="bm-pin__keypad-bar">
            <button
              type="button"
              class="bm-pin__keypad-toggle"
              :disabled="busy || isLockedOut"
              @click="showKeypad = !showKeypad"
            >
              {{ showKeypad ? t('pin.hideKeypad') : t('pin.showKeypad') }}
            </button>
            <button
              v-if="showKeypad"
              type="button"
              class="bm-pin__keypad-toggle"
              :disabled="busy || isLockedOut"
              @click="shuffleKeypadLayout"
            >
              {{ t('pin.shuffleKeypad') }}
            </button>
          </div>
          <PinKeypad
            v-if="showKeypad"
            :key="keypadShuffleKey"
            :disabled="busy || isLockedOut"
            @digit="appendKeypadDigit"
            @backspace="keypadBackspace"
          />
          <p v-if="formError" class="bm-pin__err">{{ formError }}</p>
          <div class="bm-pin__actions">
            <RetroButton variant="sm" :disabled="busy || isLockedOut" @click="onSubmitUnlock">
              {{ t('pin.unlockBtn') }}
            </RetroButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.bm-pin__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 13, 6, 0.88);
  padding: 16px;
}

.bm-pin {
  width: 100%;
  max-width: 340px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  padding: 16px 14px 14px;
  outline: none;
}

.bm-pin--wide {
  max-width: min(100%, 380px);
}

.bm-pin__keypad-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 10px;
}

.bm-pin__keypad-toggle {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: var(--accent);
  letter-spacing: 0.04em;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.bm-pin__keypad-toggle:hover:not(:disabled) {
  color: var(--text-primary);
}

.bm-pin__keypad-toggle:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bm-pin__title {
  margin: 0 0 8px;
  font-size: var(--font-size-sm);
  color: var(--accent);
  letter-spacing: 0.06em;
}

.bm-pin__hint {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.4;
}

.bm-pin__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.bm-pin__label {
  display: block;
  margin: 8px 0 4px;
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.bm-pin__radio {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.bm-pin__err {
  margin: 10px 0 0;
  font-size: var(--font-size-sm);
  color: var(--danger);
}

.bm-pin__lock {
  margin: 0 0 10px;
  font-size: var(--font-size-sm);
  color: var(--danger);
}

.bm-pin__warn {
  margin: 0 0 10px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.bm-pin__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
