<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { LangCode, TranslationResult } from '@/types/dictionary'
import { translatorService } from '@/services/translator/translator.service'
import { classifyEntryType, isKeywordEntry } from '@/services/dictionary/segmenter'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/uiLang'
import { getLangName } from '@/utils/langNames'

const auth = useAuthStore()
const langStore = useLangStore()
const { t } = langStore

const inputRef = ref<HTMLTextAreaElement | null>(null)

const inputText = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<TranslationResult | null>(null)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const alreadySaved = ref(false)

const canSaveKeyword = computed(
  () => !!result.value && isKeywordEntry(result.value.sourceText),
)

const entryTypeLabel = computed(() => {
  if (!result.value) return ''
  return classifyEntryType(result.value.sourceText)
})

const synonymsText = computed(() => {
  const list = result.value?.enrichment?.synonyms
  if (!list?.length) return ''
  return list.join(', ')
})

async function runTranslate(): Promise<void> {
  const text = inputText.value.trim()
  if (!text) {
    error.value = t('qt.errorEmpty')
    return
  }
  loading.value = true
  error.value = null
  result.value = null
  saveState.value = 'idle'
  alreadySaved.value = false
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'get-settings' })
    const targetLang: string =
      (settings as { native_language?: string })?.native_language ?? 'vi'

    const r = await translatorService.translate({
      text,
      sourceLang: 'auto',
      targetLang: targetLang as LangCode,
      mode: 'quick',
    })
    result.value = r
    if (isKeywordEntry(r.sourceText)) {
      await checkExists(r.sourceText, r.sourceLang, r.targetLang)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function checkExists(src: string, srcLang: string, tgtLang: string): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'entry-exists',
      payload: { source_text: src, source_lang: srcLang, target_lang: tgtLang },
    })
    alreadySaved.value = !!(resp as { exists?: boolean })?.exists
  } catch {
    alreadySaved.value = false
  }
}

async function doSave(): Promise<void> {
  if (!result.value || saveState.value === 'saving' || !canSaveKeyword.value) return
  if (!auth.isAuthenticated) return
  saveState.value = 'saving'
  const r = result.value
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'save-entry',
      payload: {
        source_text: r.sourceText,
        source_lang: r.sourceLang,
        target_lang: r.targetLang,
        translated_text: r.translatedText,
        entry_type: 'word',
        provider: r.provider,
        custom_note: '',
        enrichment: r.enrichment ?? null,
        starred: false,
        tags: [],
        mastery_level: 0,
        review_count: 0,
        last_reviewed_at: null,
      },
    })
    if ((resp as { ok?: boolean })?.ok) {
      saveState.value = 'saved'
      alreadySaved.value = true
    } else {
      saveState.value = 'error'
    }
  } catch {
    saveState.value = 'error'
  }
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter') return
  // Shift+Enter: xuống dòng; Enter (hoặc Ctrl+Enter): dịch ngay.
  if (e.shiftKey) return
  e.preventDefault()
  void runTranslate()
}

function focusInput(): void {
  void nextTick(() => {
    const el = inputRef.value
    if (!el) return
    el.focus()
    requestAnimationFrame(() => {
      inputRef.value?.focus()
    })
  })
}

onMounted(async () => {
  await langStore.loadLang()
  focusInput()
})

const saveIconAriaLabel = computed(() => {
  if (saveState.value === 'saving') return 'Saving to dictionary'
  if (saveState.value === 'error') return 'Retry save to dictionary'
  return 'Save word to dictionary'
})
</script>

<template>
  <div class="qt">
    <header class="qt__header">
      <span class="qt__brand">BBQOne</span>
    </header>

    <div class="qt__input-row">
      <textarea
        ref="inputRef"
        v-model="inputText"
        class="qt__input"
        rows="3"
        :placeholder="t('qt.placeholder')"
        :disabled="loading"
        autocomplete="off"
        @keydown="onInputKeydown"
      />
      <button
        type="button"
        class="qt__translate-btn"
        :disabled="loading"
        @click="runTranslate"
      >
        {{ loading ? t('qt.loading') : t('qt.btn') }}
      </button>
    </div>
    <p class="qt__hint">
      {{ t('qt.hintMain') }} <strong>{{ t('qt.hintLang') }}</strong> {{ t('qt.hintTail') }}
    </p>

    <div v-if="error" class="qt__error" role="alert">
      {{ error }}
    </div>

    <div v-if="result" class="qt__result">
      <section class="qt__pair" aria-label="Source">
        <span class="qt__pill">{{ getLangName(result.sourceLang) }}</span>
        <p class="qt__lemma qt__lemma--source">{{ result.sourceText }}</p>
        <p v-if="result.enrichment?.phonetic" class="qt__ipa">{{ result.enrichment.phonetic }}</p>
      </section>

      <section class="qt__pair qt__pair--target" aria-label="Translation">
        <div class="qt__target-row">
          <span class="qt__pill qt__pill--target">{{ getLangName(result.targetLang).toUpperCase() }}</span>
          <div v-if="canSaveKeyword" class="qt__target-row-actions">
              <template v-if="auth.isAuthenticated">
              <button
                v-if="saveState === 'error'"
                type="button"
                class="qt__save-icon"
                title="Retry save"
                :aria-label="saveIconAriaLabel"
                @click="doSave"
              >
                <svg class="qt__save-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zM5 5h10v4H5V5z"
                  />
                </svg>
              </button>
              <button
                v-else-if="!alreadySaved && saveState !== 'saved'"
                type="button"
                class="qt__save-icon"
                :class="{ 'qt__save-icon--busy': saveState === 'saving' }"
                :disabled="saveState === 'saving'"
                title="Save to dictionary"
                :aria-label="saveIconAriaLabel"
                @click="doSave"
              >
                <svg class="qt__save-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zM5 5h10v4H5V5z"
                  />
                </svg>
              </button>
              <span v-else class="qt__saved-icon" title="Saved" aria-label="Saved to dictionary">
                <svg class="qt__save-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                  />
                </svg>
              </span>
              </template>
              <span
                v-else
                class="qt__save-icon qt__save-icon--locked"
                title="Right-click toolbar icon → Login to save"
                role="img"
                aria-label="Sign in required to save to dictionary"
              >
                <svg class="qt__save-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                  />
                </svg>
              </span>
          </div>
        </div>
        <p class="qt__lemma qt__lemma--target">{{ result.translatedText }}</p>

        <p v-if="result.enrichment?.partOfSpeech" class="qt__lex qt__lex--dict">
          <em class="qt__pos">{{ result.enrichment.partOfSpeech }}</em>
          <span v-if="synonymsText" class="qt__synonyms"> · {{ synonymsText }}</span>
        </p>
        <p v-else class="qt__lex">
          <em class="qt__pos">{{ entryTypeLabel }}</em>
          <span v-if="canSaveKeyword" class="qt__kw-hint"> · eligible for dictionary</span>
        </p>

        <p v-if="canSaveKeyword && !auth.isAuthenticated" class="qt__login-hint">
          Tap the lock — then log in via right-click on the toolbar icon to save.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.qt {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  width: 100%;
  min-width: 0;
  padding: 12px 14px 14px;
  background: var(--bg-primary);
}

.qt__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}

.qt__brand {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.06em;
}

.qt__sub {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.qt__input-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.qt__input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 72px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  resize: vertical;
  line-height: 1.45;
}

.qt__translate-btn {
  flex-shrink: 0;
  align-self: stretch;
  min-width: 96px;
  padding: 8px 12px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #fff;
  background: var(--accent-dashboard);
}

.qt__translate-btn:hover:not(:disabled) {
  filter: brightness(1.05);
}

.qt__translate-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.qt__hint {
  margin: 8px 0 0;
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.35;
}

.qt__error {
  margin-top: 10px;
  padding: 8px 10px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid var(--border);
  background: var(--bg-panel);
}

.qt__result {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

/* Hai khối song song: tag + từ chính — cùng gap, canh trái; tách nhẹ bằng viền */
.qt__pair {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
}

.qt__pair + .qt__pair {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.qt__target-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.qt__target-row-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.qt__save-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(30, 88, 184, 0.45);
  border-radius: 2px;
  background: rgba(32, 92, 176, 0.08);
  color: var(--accent-dashboard);
  cursor: pointer;
}

.qt__save-icon:hover:not(:disabled) {
  border-color: var(--accent-dashboard);
  background: rgba(32, 92, 176, 0.14);
}

.qt__save-icon:disabled,
.qt__save-icon--busy {
  opacity: 0.55;
  cursor: wait;
}

.qt__save-icon--locked {
  cursor: default;
  border-color: var(--border);
  background: var(--bg-secondary);
  color: var(--text-muted);
}

.qt__save-icon-svg {
  width: 18px;
  height: 18px;
  display: block;
}

.qt__saved-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--success);
}

.qt__saved-icon .qt__save-icon-svg {
  color: var(--success);
}

.qt__pill {
  display: inline-block;
  font-size: 9px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  color: var(--accent-dashboard);
  background: var(--bg-panel);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Cùng họ tag với nguồn; nhấn nhẹ cobalt để khớp dòng dịch bên dưới */
.qt__pill--target {
  text-transform: none;
  font-weight: 600;
  letter-spacing: 0.08em;
  border-color: rgba(30, 88, 184, 0.42);
  background: rgba(32, 92, 176, 0.09);
}

/* Từ gốc / bản dịch: cùng cỡ, cùng độ đậm — không để nguồn nhỏ hơn đích */
.qt__lemma {
  margin: 0;
  width: 100%;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0.01em;
  word-break: break-word;
}

.qt__lemma--source {
  color: var(--text-primary);
}

.qt__lemma--target {
  color: var(--accent-dashboard);
}

.qt__ipa {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
  line-height: 1.4;
}

.qt__lex {
  margin: 0 0 10px;
  font-size: 11px;
  color: var(--text-muted);
}

.qt__lex--dict {
  line-height: 1.45;
}

.qt__synonyms {
  font-style: normal;
  color: var(--text-secondary);
  word-break: break-word;
}

.qt__pos {
  font-style: italic;
}

.qt__kw-hint {
  opacity: 0.85;
}

.qt__login-hint {
  margin: 0;
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
  max-width: 100%;
}

.qt__provider {
  margin: 10px 0 0;
  font-size: 9px;
  color: var(--text-muted);
  opacity: 0.7;
}
</style>
