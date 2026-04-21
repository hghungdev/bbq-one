<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useTranslationSettingsStore } from '@/stores/translationSettings'
import { useLangStore } from '@/stores/uiLang'
import type { LangCode } from '@/types/dictionary'

const settingsStore = useTranslationSettingsStore()
const { t } = useLangStore()

const LANGS: Array<{ code: LangCode; label: string }> = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'th', label: 'ไทย' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
]

const native = ref<LangCode>('vi')
const learning = ref<LangCode[]>(['en'])
const saveError = ref<string | null>(null)

onMounted(async () => {
  await settingsStore.load()
  if (settingsStore.settings) {
    native.value = settingsStore.settings.native_language
    learning.value = [...settingsStore.settings.learning_languages]
  }
})

// Persist changes reactively — debounced via watch
watch(native, async (v) => {
  saveError.value = null
  try {
    await settingsStore.updateNativeLanguage(v)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e)
  }
})

watch(
  learning,
  async (v) => {
    saveError.value = null
    try {
      await settingsStore.updateLearningLanguages([...v])
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : String(e)
    }
  },
  { deep: true },
)

function toggleLearning(code: LangCode): void {
  const i = learning.value.indexOf(code)
  if (i >= 0) {
    learning.value.splice(i, 1)
  } else {
    learning.value.push(code)
  }
}

/** Languages available as learning target (exclude current native) */
function learningLangs(): Array<{ code: LangCode; label: string }> {
  return LANGS.filter((l) => l.code !== native.value)
}
</script>

<template>
  <div class="tsp">
    <p class="tsp__desc">
      {{ t('translation.desc') }}
    </p>

    <!-- Native language -->
    <div class="tsp__section">
      <div class="tsp__label">{{ t('translation.nativeLang') }}</div>
      <select v-model="native" class="tsp__select">
        <option v-for="l in LANGS" :key="l.code" :value="l.code">
          {{ l.label }} ({{ l.code.toUpperCase() }})
        </option>
      </select>
    </div>

    <!-- Learning languages -->
    <div class="tsp__section">
      <div class="tsp__label">{{ t('translation.learningLangs') }}</div>
      <div class="tsp__checks">
        <label
          v-for="l in learningLangs()"
          :key="l.code"
          class="tsp__check"
        >
          <input
            type="checkbox"
            :checked="learning.includes(l.code)"
            @change="toggleLearning(l.code)"
          />
          <span>{{ l.label }}</span>
        </label>
      </div>
      <p v-if="!learning.length" class="tsp__warn">
        {{ t('translation.warnLang') }}
      </p>
    </div>

    <!-- Save error feedback -->
    <p v-if="saveError" class="tsp__error">{{ saveError }}</p>

    <!-- Loading state -->
    <p v-if="settingsStore.loading" class="tsp__loading">
      {{ t('translation.saving') }}
    </p>
  </div>
</template>

<style scoped>
.tsp {
  padding: 0;
}

.tsp__desc {
  margin: 0 0 12px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.tsp__section {
  margin-bottom: 14px;
}

.tsp__label {
  font-size: 10px;
  color: var(--accent);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tsp__select {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 0;
  font-family: inherit;
  font-size: var(--font-size-sm);
  padding: 6px 8px;
  width: 100%;
  cursor: pointer;
}

.tsp__select:focus {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.tsp__checks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}

.tsp__check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-sm);
  cursor: pointer;
  color: var(--text-primary);
}

.tsp__check input[type='checkbox'] {
  accent-color: var(--accent);
  cursor: pointer;
}

.tsp__warn {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--danger);
}

.tsp__error {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--danger);
}

.tsp__loading {
  margin: 4px 0 0;
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.7;
}
</style>
