<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useBookmarkPinStore } from '@/stores/bookmarkPin'
import { useSettingsStore, type FontSizePx } from '@/stores/settings'
import { bookmarkPinWeakReason } from '@/utils/bookmarkPinValidation'

const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const bookmarkPin = useBookmarkPinStore()

const sizes: FontSizePx[] = [11, 13, 15]

const bmPinOld = ref('')
const bmPinNew = ref('')
const bmPinConfirm = ref('')
const bmPinBusy = ref(false)
const bmPinError = ref<string | null>(null)
const bmPinOk = ref(false)

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
    bmPinError.value = 'PIN hiện tại phải đúng 6 hoặc 9 chữ số.'
    return
  }
  if (!/^\d{6}$/.test(newP) && !/^\d{9}$/.test(newP)) {
    bmPinError.value = 'PIN mới phải đúng 6 hoặc 9 chữ số.'
    return
  }
  if (newP !== c) {
    bmPinError.value = 'Nhập lại PIN mới không khớp.'
    return
  }
  const weakNew = bookmarkPinWeakReason(newP)
  if (weakNew) {
    bmPinError.value = weakNew
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

function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

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
        SETTINGS
      </h2>
      <p class="settings-label">
        FONT SIZE (PX)
      </p>
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

      <p class="settings-label">
        BOOKMARK PIN
      </p>
      <p v-if="!bookmarkPin.hasCryptoSetup" class="settings-hint">
        Chưa đặt PIN — mở tab [ BOOKMARK ] để đặt PIN và bật backup tự động.
      </p>
      <template v-else>
        <p class="settings-hint settings-hint--sub">
          Đổi PIN sẽ cập nhật salt và mã hóa lại các bản backup đã mã hóa trên server.
        </p>
        <label class="settings-field-label" for="set-bm-pin-old">PIN hiện tại</label>
        <RetroInput
          id="set-bm-pin-old"
          :model-value="bmPinOld"
          type="password"
          digit-only
          autocomplete="current-password"
          placeholder="6 hoặc 9 chữ số"
          :disabled="bmPinBusy"
          :maxlength="9"
          @update:model-value="bmPinOld = bmDigits($event, 9)"
        />
        <label class="settings-field-label" for="set-bm-pin-new">PIN mới</label>
        <RetroInput
          id="set-bm-pin-new"
          :model-value="bmPinNew"
          type="password"
          digit-only
          autocomplete="new-password"
          placeholder="6 hoặc 9 chữ số"
          :disabled="bmPinBusy"
          :maxlength="9"
          @update:model-value="bmPinNew = bmDigits($event, 9)"
        />
        <label class="settings-field-label" for="set-bm-pin-confirm">Nhập lại PIN mới</label>
        <RetroInput
          id="set-bm-pin-confirm"
          :model-value="bmPinConfirm"
          type="password"
          digit-only
          autocomplete="new-password"
          placeholder="6 hoặc 9 chữ số"
          :disabled="bmPinBusy"
          :maxlength="9"
          @update:model-value="bmPinConfirm = bmDigits($event, 9)"
        />
        <p v-if="bmPinError" class="settings-pin-err">{{ bmPinError }}</p>
        <p v-else-if="bmPinOk" class="settings-pin-ok">&gt; Đã đổi PIN bookmark.</p>
        <div class="settings-row settings-row--pin">
          <RetroButton
            variant="sm"
            type="button"
            :disabled="bmPinBusy"
            @click="onChangeBookmarkPin"
          >
            [ ĐỔI PIN ]
          </RetroButton>
        </div>
      </template>

      <RetroButton type="button" class="settings-close" @click="emit('close')">
        [ CLOSE ]
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
  padding: 16px;
}

.settings-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(13, 13, 6, 0.75);
}

.settings-panel {
  position: relative;
  z-index: 1;
  min-width: 280px;
  max-width: 100%;
  padding: 16px 18px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  box-shadow: 0 0 0 1px var(--accent);
}

.settings-title {
  margin: 0 0 12px;
  font-size: var(--font-size-lg);
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.settings-label {
  margin: 0 0 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.settings-row--pin {
  margin-top: 10px;
  margin-bottom: 16px;
}

.settings-hint {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.4;
}

.settings-hint--sub {
  margin-bottom: 10px;
  font-size: 11px;
}

.settings-field-label {
  display: block;
  margin: 8px 0 4px;
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
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
  width: 100%;
}
</style>
