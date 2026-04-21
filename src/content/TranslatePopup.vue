<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

  import type { LangCode, TranslationResult } from '@/types/dictionary'

  import { translatorService } from '@/services/translator/translator.service'

  import { isKeywordEntry } from '@/services/dictionary/segmenter'

  import { getLangName } from '@/utils/langNames'

  import { BBQ_AUTH_LOGGED_IN_KEY, UI_LANG_KEY } from '@/constants/storage'

  import { en } from '@/i18n/en'
  import { vi } from '@/i18n/vi'
  import type { I18nKey } from '@/i18n/en'

  const uiLang = ref<'en' | 'vi'>('en')
  const LOCALES: Record<string, Record<string, string>> = {
    en: en as Record<string, string>,
    vi: vi as Record<string, string>,
  }
  function t(key: I18nKey, params?: Record<string, string | number>): string {
    const locale = LOCALES[uiLang.value]
    let str = locale?.[key] ?? (en as Record<string, string>)[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, String(v))
      }
    }
    return str
  }

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
    if (saveState.value === 'saved') return t('popup.savedHint')

    if (alreadySaved.value && saveState.value === 'idle') return t('popup.alreadySaved')

    return t('popup.savedHint')
  })

  const showMetaRow = computed(() => {
    const r = result.value

    if (!r) return false

    return !!(r.enrichment?.partOfSpeech || r.confidence !== undefined)
  })

  const popupStyle = ref({ top: '0px', left: '0px' })

  const popupEl = ref<HTMLElement | null>(null)

  const POPUP_WIDTH = 348

  const VIEW_MARGIN = 8

  async function refreshAuth(): Promise<void> {
    const data = await chrome.storage.local.get([BBQ_AUTH_LOGGED_IN_KEY, UI_LANG_KEY])

    isAuthenticated.value = !!data[BBQ_AUTH_LOGGED_IN_KEY]
    const lang = data[UI_LANG_KEY]
    if (lang === 'vi' || lang === 'en') uiLang.value = lang
  }

  function onAuthStorageChanged(
    changes: Record<string, chrome.storage.StorageChange>,

    area: string,
  ): void {
    if (area !== 'local' || !changes[BBQ_AUTH_LOGGED_IN_KEY]) return

    isAuthenticated.value = !!changes[BBQ_AUTH_LOGGED_IN_KEY].newValue
  }

  /** Đo chiều cao thật sau khi dịch xong; tránh giả định 240px làm cắt nội dung / tràn viewport. */
  function adjustPosition(): void {
    const el = popupEl.value

    const h = el?.getBoundingClientRect().height ?? 200

    let top = props.rect.bottom + VIEW_MARGIN

    if (top + h > window.innerHeight - VIEW_MARGIN) {
      top = props.rect.top - h - VIEW_MARGIN
    }

    if (top < VIEW_MARGIN) {
      top = VIEW_MARGIN
    }

    let left = props.rect.left

    if (left + POPUP_WIDTH > window.innerWidth - VIEW_MARGIN) {
      left = window.innerWidth - POPUP_WIDTH - VIEW_MARGIN
    }

    if (left < VIEW_MARGIN) left = VIEW_MARGIN

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

  let popupResizeObserver: ResizeObserver | null = null

  function onResize(): void {
    adjustPosition()
  }

  watch([loading, result, error], async () => {
    await nextTick()

    adjustPosition()
  })

  onMounted(() => {
    void nextTick(() => {
      const el = popupEl.value

      if (el && typeof ResizeObserver !== 'undefined') {
        popupResizeObserver = new ResizeObserver(() => {
          adjustPosition()
        })

        popupResizeObserver.observe(el)
      }

      adjustPosition()
    })

    void refreshAuth()

    void doTranslate()

    document.addEventListener('keydown', onKeyDown)

    window.addEventListener('resize', onResize)

    chrome.storage.onChanged.addListener(onAuthStorageChanged)
  })

  onUnmounted(() => {
    popupResizeObserver?.disconnect()

    popupResizeObserver = null

    document.removeEventListener('keydown', onKeyDown)

    window.removeEventListener('resize', onResize)

    chrome.storage.onChanged.removeListener(onAuthStorageChanged)
  })
</script>

<template>
  <div ref="popupEl" class="bbq-popup" :style="popupStyle">
    <div class="bbq-popup__header">
      <span class="bbq-popup__brand">{{ t('popup.brand') }}</span>

      <button class="bbq-popup__close" type="button" :aria-label="t('popup.close')" @click="props.onClose">
        {{ t('popup.close') }}
      </button>
    </div>

    <div class="bbq-popup__body">
      <div v-if="loading" class="bbq-popup__loading">{{ t('popup.translating') }}</div>

      <div v-else-if="error" class="bbq-popup__error">{{ t('common.error') }} {{ error }}</div>

      <div v-else-if="result" class="bbq-popup__result">
        <!-- Nguồn: tag + từ + IPA (IPA thuộc từ gốc) -->

        <section class="bbq-popup__pane bbq-popup__pane--source" aria-label="Source">
          <span class="bbq-popup__lang">{{ getLangName(result.sourceLang) }}</span>

          <div class="bbq-popup__pane-body">
            <p class="bbq-popup__lemma">{{ result.sourceText }}</p>

            <p v-if="result.enrichment?.phonetic" class="bbq-popup__ipa">
              {{ result.enrichment.phonetic }}
            </p>
          </div>
        </section>

        <div class="bbq-popup__split" aria-hidden="true" />

        <!-- Đích: hàng tag + save, rồi bản dịch lớn -->

        <section class="bbq-popup__pane bbq-popup__pane--target" aria-label="Translation">
          <div class="bbq-popup__target-head">
            <span class="bbq-popup__lang">{{ getLangName(result.targetLang) }}</span>

            <div v-if="canSaveKeyword" class="bbq-popup__target-actions">
              <template v-if="isAuthenticated">
                <button
                  v-if="saveState === 'error'"
                  type="button"
                  class="bbq-popup__save-icon"
                  :title="t('popup.retryTitle')"
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
                  :title="t('popup.saveTitle')"
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
                :title="t('popup.lockTitle')"
                role="img"
                :aria-label="t('popup.lockAriaLabel')"
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
              {{ Math.round(result.confidence * 100) }}{{ t('popup.confidence') }}
            </div>
          </div>

          <p v-if="canSaveKeyword && !isAuthenticated" class="bbq-popup__login-hint">
            {{ t('popup.loginHint') }}
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
