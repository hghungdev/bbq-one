<script setup lang="ts">
import { onMounted, ref } from 'vue'
import SettingsAccordionSection from '@/components/layout/SettingsAccordionSection.vue'
import { BBQ_OMNIBOX_MODE_KEY } from '@/constants/storage'
import { useLangStore } from '@/stores/uiLang'
import { DEFAULT_OMNIBOX_MODE, parseOmniboxMode, type OmniboxMode } from '@/utils/omniboxNotes'

/**
 * S12: Cài đặt › Tìm từ thanh địa chỉ (`bbq …`) — Tên + đoạn trích (mặc định, như F1) / Chỉ tên / Tắt.
 * background.ts đọc cùng khóa kho; đổi ở đây là gợi ý lần gõ sau theo ngay (cache omnibox nghe storage.onChanged).
 */
const { t } = useLangStore()

const MODE_OPTIONS = [
  { value: 'full', labelKey: 'settings.omnibox.full' },
  { value: 'title', labelKey: 'settings.omnibox.titleOnly' },
  { value: 'off', labelKey: 'settings.omnibox.off' },
] as const

const mode = ref<OmniboxMode>(DEFAULT_OMNIBOX_MODE)

onMounted(async () => {
  const r = await chrome.storage.local.get(BBQ_OMNIBOX_MODE_KEY)
  mode.value = parseOmniboxMode(r[BBQ_OMNIBOX_MODE_KEY])
})

async function setMode(next: OmniboxMode): Promise<void> {
  mode.value = next
  await chrome.storage.local.set({ [BBQ_OMNIBOX_MODE_KEY]: next })
}
</script>

<template>
  <SettingsAccordionSection :title="t('settings.omnibox.title')" :default-open="false">
    <p class="omnibox-settings__hint">{{ t('settings.omnibox.desc') }}</p>
    <div class="omnibox-settings__options" role="radiogroup" :aria-label="t('settings.omnibox.title')">
      <label v-for="opt in MODE_OPTIONS" :key="opt.value" class="omnibox-settings__option">
        <input
          type="radio"
          name="bbqone-omnibox-mode"
          :value="opt.value"
          :checked="mode === opt.value"
          @change="setMode(opt.value)"
        />
        <span>{{ t(opt.labelKey) }}</span>
      </label>
    </div>
    <p class="omnibox-settings__hint omnibox-settings__hint--sub">{{ t('settings.omnibox.chromeHistory') }}</p>
  </SettingsAccordionSection>
</template>

<style scoped>
.omnibox-settings__hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}

.omnibox-settings__hint--sub {
  margin: 8px 0 0;
  font-size: 10px;
}

.omnibox-settings__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.omnibox-settings__option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  cursor: pointer;
}

.omnibox-settings__option input {
  margin: 0;
  accent-color: var(--accent);
}
</style>
