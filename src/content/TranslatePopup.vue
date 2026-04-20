<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'

  import type { LangCode, TranslationResult } from '@/types/dictionary'

  import { translatorService } from '@/services/translator/translator.service'

  import { isKeywordEntry } from '@/services/dictionary/segmenter'

  import { BBQ_AUTH_LOGGED_IN_KEY } from '@/constants/storage'

  const props = defineProps<{
    text: string

    rect: DOMRect

    onClose: () => void
  }>()

  const loading = ref(true)

  const error = ref<string | null>(null)

  const result = ref<TranslationResult | null>(null)

  const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const alreadySaved = ref(false)

  const isAuthenticated = ref(false)

  const canSaveKeyword = computed(() => !!result.value && isKeywordEntry(result.value.sourceText))

  const synonymsLine = computed(() => {
    const list = result.value?.enrichment?.synonyms

    if (!list?.length) return ''

    return list.join(', ')
  })

  const saveIconAriaLabel = computed(() => {
    if (saveState.value === 'saving') return 'Saving to dictionary'

    if (saveState.value === 'error') return 'Retry save to dictionary'

    return 'Save word to dictionary'
  })

  const savedHint = computed(() => {
    if (saveState.value === 'saved') return 'Saved to dictionary'

    if (alreadySaved.value && saveState.value === 'idle') return 'Already in dictionary'

    return 'Saved to dictionary'
  })

  const showMetaRow = computed(() => {
    const r = result.value

    if (!r) return false

    return !!(r.enrichment?.partOfSpeech || r.confidence !== undefined)
  })

  const popupStyle = ref({ top: '0px', left: '0px' })

  async function refreshAuth(): Promise<void> {
    const data = await chrome.storage.local.get(BBQ_AUTH_LOGGED_IN_KEY)

    isAuthenticated.value = !!data[BBQ_AUTH_LOGGED_IN_KEY]
  }

  function onAuthStorageChanged(
    changes: Record<string, chrome.storage.StorageChange>,

    area: string,
  ): void {
    if (area !== 'local' || !changes[BBQ_AUTH_LOGGED_IN_KEY]) return

    isAuthenticated.value = !!changes[BBQ_AUTH_LOGGED_IN_KEY].newValue
  }

  function calcPosition(): void {
    const POPUP_WIDTH = 348

    const POPUP_HEIGHT = 240

    const MARGIN = 8

    let top = props.rect.bottom + MARGIN

    if (top + POPUP_HEIGHT > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, props.rect.top - POPUP_HEIGHT - MARGIN)
    }

    let left = props.rect.left

    if (left + POPUP_WIDTH > window.innerWidth - MARGIN) {
      left = window.innerWidth - POPUP_WIDTH - MARGIN
    }

    if (left < MARGIN) left = MARGIN

    popupStyle.value = { top: `${top}px`, left: `${left}px` }
  }

  async function doTranslate(): Promise<void> {
    loading.value = true

    error.value = null

    try {
      const settings = await chrome.runtime.sendMessage({ type: 'get-settings' })

      const targetLang: string = (settings as { native_language?: string })?.native_language ?? 'vi'

      const r = await translatorService.translate({
        text: props.text,

        sourceLang: 'auto',

        targetLang: targetLang as LangCode,

        mode: 'quick',
      })

      result.value = r

      if (isKeywordEntry(r.sourceText)) {
        await checkExists(r.sourceText, r.sourceLang, r.targetLang)
      } else {
        alreadySaved.value = false
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
    if (!canSaveKeyword.value || !result.value || saveState.value === 'saving') return

    if (!isAuthenticated.value) return

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

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') props.onClose()
  }

  onMounted(() => {
    calcPosition()

    void refreshAuth()

    void doTranslate()

    document.addEventListener('keydown', onKeyDown)

    chrome.storage.onChanged.addListener(onAuthStorageChanged)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeyDown)

    chrome.storage.onChanged.removeListener(onAuthStorageChanged)
  })
</script>

<template>
  <div class="bbq-popup" :style="popupStyle">
    <div class="bbq-popup__header">
      <span class="bbq-popup__brand">ONE &gt; TRANSLATE</span>

      <button class="bbq-popup__close" type="button" @click="props.onClose" aria-label="Close">
        ×
      </button>
    </div>

    <div class="bbq-popup__body">
      <div v-if="loading" class="bbq-popup__loading">Translating…</div>

      <div v-else-if="error" class="bbq-popup__error">[ERROR] {{ error }}</div>

      <div v-else-if="result" class="bbq-popup__result">
        <!-- Nguồn: tag + từ + IPA (IPA thuộc từ gốc) -->

        <section class="bbq-popup__pane" aria-label="Source">
          <div class="bbq-popup__row">
            <span class="bbq-popup__lang">{{ result.sourceLang }}</span>

            <div class="bbq-popup__pane-body">
              <p class="bbq-popup__lemma">{{ result.sourceText }}</p>

              <p v-if="result.enrichment?.phonetic" class="bbq-popup__ipa">
                {{ result.enrichment.phonetic }}
              </p>
            </div>
          </div>
        </section>

        <div class="bbq-popup__split" aria-hidden="true" />

        <!-- Đích: hàng tag + save, rồi bản dịch lớn -->

        <section class="bbq-popup__pane bbq-popup__pane--target" aria-label="Translation">
          <div class="bbq-popup__target-head">
            <span class="bbq-popup__lang">{{ result.targetLang }}</span>

            <div v-if="canSaveKeyword" class="bbq-popup__target-actions">
              <template v-if="isAuthenticated">
                <button
                  v-if="saveState === 'error'"
                  type="button"
                  class="bbq-popup__save-icon"
                  title="Retry save"
                  :aria-label="saveIconAriaLabel"
                  @click="doSave"
                >
                  <svg
                    class="bbq-popup__save-icon-svg"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      fill="currentColor"
                      d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zM5 5h10v4H5V5z"
                    />
                  </svg>
                </button>

                <button
                  v-else-if="!alreadySaved && saveState !== 'saved'"
                  type="button"
                  class="bbq-popup__save-icon"
                  :class="{ 'bbq-popup__save-icon--busy': saveState === 'saving' }"
                  :disabled="saveState === 'saving'"
                  title="Save to dictionary"
                  :aria-label="saveIconAriaLabel"
                  @click="doSave"
                >
                  <svg
                    class="bbq-popup__save-icon-svg"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      fill="currentColor"
                      d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zM5 5h10v4H5V5z"
                    />
                  </svg>
                </button>

                <span
                  v-else
                  class="bbq-popup__saved-icon"
                  :title="savedHint"
                  :aria-label="savedHint"
                >
                  <svg
                    class="bbq-popup__save-icon-svg"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                    />
                  </svg>
                </span>
              </template>

              <span
                v-else
                class="bbq-popup__save-icon bbq-popup__save-icon--locked"
                title="Right-click toolbar icon → Login to save"
                role="img"
                aria-label="Sign in required to save to dictionary"
              >
                <svg
                  class="bbq-popup__save-icon-svg"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fill="currentColor"
                    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                  />
                </svg>
              </span>
            </div>
          </div>

          <p class="bbq-popup__lemma bbq-popup__lemma--target">{{ result.translatedText }}</p>

          <div v-if="showMetaRow" class="bbq-popup__meta">
            <div v-if="result.enrichment?.partOfSpeech" class="bbq-popup__dict-line">
              <em class="bbq-popup__pos">{{ result.enrichment.partOfSpeech }}</em>

              <span v-if="synonymsLine" class="bbq-popup__synonyms"> · {{ synonymsLine }}</span>
            </div>

            <div v-if="result.confidence !== undefined" class="bbq-popup__confidence">
              {{ Math.round(result.confidence * 100) }}% confidence
            </div>
          </div>

          <p v-if="canSaveKeyword && !isAuthenticated" class="bbq-popup__login-hint">
            Tap the lock — right-click toolbar icon → Login to save.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
